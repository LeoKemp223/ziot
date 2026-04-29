#include <mosquitto.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static volatile int running = 1;

struct demo_config {
    const char *product_key;
    const char *device_key;
    const char *device_secret;
};

static const char *env_or_default(const char *name, const char *fallback)
{
    const char *value = getenv(name);
    return value && value[0] ? value : fallback;
}

static void handle_signal(int signum)
{
    (void)signum;
    running = 0;
}

static void build_topic(
    char *buffer,
    size_t size,
    const char *product_key,
    const char *device_key,
    const char *suffix)
{
    snprintf(buffer, size, "/sys/%s/%s/%s", product_key, device_key, suffix);
}

static void publish_property(struct mosquitto *mosq, const struct demo_config *config)
{
    char topic[256];
    char payload[256];
    long long now_ms = (long long)time(NULL) * 1000;

    build_topic(
        topic,
        sizeof(topic),
        config->product_key,
        config->device_key,
        "thing/property/post");
    snprintf(
        payload,
        sizeof(payload),
        "{\"id\":\"%lld\",\"params\":{\"temperature\":23.6,\"humidity\":58}}",
        now_ms);

    mosquitto_publish(mosq, NULL, topic, (int)strlen(payload), payload, 1, false);
    printf("published property topic=%s\n", topic);
}

static void on_connect(struct mosquitto *mosq, void *userdata, int rc)
{
    struct demo_config *config = (struct demo_config *)userdata;
    char topic[256];

    if (rc != 0) {
        printf("connect failed rc=%d\n", rc);
        running = 0;
        return;
    }

    printf("connected username=%s:%s\n", config->product_key, config->device_key);
    build_topic(
        topic,
        sizeof(topic),
        config->product_key,
        config->device_key,
        "thing/service/+/invoke");
    mosquitto_subscribe(mosq, NULL, topic, 1);
    publish_property(mosq, config);
}

static void reply_service_command(
    struct mosquitto *mosq,
    const struct demo_config *config,
    const char *command_topic)
{
    char prefix[256];
    char suffix[] = "/invoke";
    char identifier[128] = "unknown";
    char reply_topic[256];
    char payload[128];
    const char *start;
    const char *end;
    long long now_ms = (long long)time(NULL) * 1000;

    build_topic(
        prefix,
        sizeof(prefix),
        config->product_key,
        config->device_key,
        "thing/service/");

    start = strstr(command_topic, prefix);
    if (start == command_topic) {
        start += strlen(prefix);
        end = strstr(start, suffix);
        if (end && end > start) {
            size_t len = (size_t)(end - start);
            if (len >= sizeof(identifier)) {
                len = sizeof(identifier) - 1;
            }
            memcpy(identifier, start, len);
            identifier[len] = '\0';
        }
    }

    snprintf(
        reply_topic,
        sizeof(reply_topic),
        "/sys/%s/%s/thing/service/%s/reply",
        config->product_key,
        config->device_key,
        identifier);
    snprintf(payload, sizeof(payload), "{\"id\":\"%lld\",\"code\":0,\"data\":{}}", now_ms);

    mosquitto_publish(mosq, NULL, reply_topic, (int)strlen(payload), payload, 1, false);
    printf("replied topic=%s\n", reply_topic);
}

static void on_message(
    struct mosquitto *mosq,
    void *userdata,
    const struct mosquitto_message *message)
{
    const struct demo_config *config = (const struct demo_config *)userdata;

    printf("command topic=%s payload=%.*s\n",
           message->topic,
           message->payloadlen,
           (const char *)message->payload);
    reply_service_command(mosq, config, message->topic);
}

int main(void)
{
    const char *host = env_or_default("MQTT_HOST", "localhost");
    int port = atoi(env_or_default("MQTT_PORT", "1883"));
    struct demo_config config = {
        .product_key = env_or_default("PRODUCT_KEY", "pk_demo"),
        .device_key = env_or_default("DEVICE_KEY", "dk_mqtt_demo"),
        .device_secret = env_or_default("DEVICE_SECRET", "DeviceSecret123"),
    };
    char username[256];
    struct mosquitto *mosq;
    int rc;

    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);

    snprintf(username, sizeof(username), "%s:%s", config.product_key, config.device_key);

    mosquitto_lib_init();
    mosq = mosquitto_new(config.device_key, true, &config);
    if (!mosq) {
        fprintf(stderr, "failed to create mosquitto client\n");
        mosquitto_lib_cleanup();
        return 1;
    }

    mosquitto_username_pw_set(mosq, username, config.device_secret);
    mosquitto_connect_callback_set(mosq, on_connect);
    mosquitto_message_callback_set(mosq, on_message);

    rc = mosquitto_connect(mosq, host, port, 60);
    if (rc != MOSQ_ERR_SUCCESS) {
        fprintf(stderr, "connect error: %s\n", mosquitto_strerror(rc));
        mosquitto_destroy(mosq);
        mosquitto_lib_cleanup();
        return 1;
    }

    while (running) {
        rc = mosquitto_loop(mosq, 1000, 1);
        if (running && rc != MOSQ_ERR_SUCCESS) {
            fprintf(stderr, "mqtt loop error: %s\n", mosquitto_strerror(rc));
            break;
        }
    }

    mosquitto_disconnect(mosq);
    mosquitto_destroy(mosq);
    mosquitto_lib_cleanup();
    return 0;
}
