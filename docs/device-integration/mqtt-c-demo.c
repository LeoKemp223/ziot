#include "MQTTPacket.h"

#include <errno.h>
#include <netdb.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>

#define MQTT_BUFFER_SIZE 1024

static volatile int running = 1;
static int active_socket = -1;

struct demo_config {
    const char *host;
    int port;
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

static int open_socket(const char *host, int port)
{
    struct addrinfo hints;
    struct addrinfo *result = NULL;
    struct addrinfo *rp = NULL;
    char port_text[16];
    int sock = -1;
    struct timeval timeout;

    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = SOCK_STREAM;
    snprintf(port_text, sizeof(port_text), "%d", port);

    if (getaddrinfo(host, port_text, &hints, &result) != 0) {
        return -1;
    }

    for (rp = result; rp != NULL; rp = rp->ai_next) {
        sock = socket(rp->ai_family, rp->ai_socktype, rp->ai_protocol);
        if (sock < 0) {
            continue;
        }

        if (connect(sock, rp->ai_addr, rp->ai_addrlen) == 0) {
            break;
        }

        close(sock);
        sock = -1;
    }

    freeaddrinfo(result);

    if (sock >= 0) {
        timeout.tv_sec = 1;
        timeout.tv_usec = 0;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    }

    return sock;
}

static int send_all(int sock, const unsigned char *buffer, int length)
{
    int sent = 0;

    while (sent < length) {
        ssize_t rc = send(sock, buffer + sent, (size_t)(length - sent), 0);
        if (rc <= 0) {
            return -1;
        }
        sent += (int)rc;
    }

    return sent;
}

static int mqtt_read_data(unsigned char *buffer, int count)
{
    ssize_t rc = recv(active_socket, buffer, (size_t)count, 0);

    if (rc < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
        return 0;
    }

    return (int)rc;
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

static void mqtt_string_to_c(const MQTTString *source, char *buffer, size_t size)
{
    int len = 0;

    if (size == 0) {
        return;
    }

    if (source->cstring) {
        snprintf(buffer, size, "%s", source->cstring);
        return;
    }

    len = source->lenstring.len;
    if (len < 0) {
        len = 0;
    }
    if ((size_t)len >= size) {
        len = (int)size - 1;
    }
    memcpy(buffer, source->lenstring.data, (size_t)len);
    buffer[len] = '\0';
}

static int send_connect(int sock, const struct demo_config *config)
{
    unsigned char buffer[MQTT_BUFFER_SIZE];
    MQTTPacket_connectData data = MQTTPacket_connectData_initializer;
    char username[256];
    int len;
    int packet_type;
    unsigned char session_present = 0;
    unsigned char connack_rc = 0;

    snprintf(username, sizeof(username), "%s:%s", config->product_key, config->device_key);

    data.clientID.cstring = (char *)config->device_key;
    data.keepAliveInterval = 60;
    data.cleansession = 1;
    data.username.cstring = username;
    data.password.cstring = (char *)config->device_secret;

    len = MQTTSerialize_connect(buffer, sizeof(buffer), &data);
    if (len <= 0 || send_all(sock, buffer, len) != len) {
        return -1;
    }

    packet_type = MQTTPacket_read(buffer, sizeof(buffer), mqtt_read_data);
    if (packet_type != CONNACK) {
        return -1;
    }

    if (MQTTDeserialize_connack(&session_present, &connack_rc, buffer, sizeof(buffer)) != 1 ||
        connack_rc != 0) {
        fprintf(stderr, "connect rejected rc=%u\n", connack_rc);
        return -1;
    }

    printf("connected username=%s\n", username);
    return 0;
}

static int subscribe_topic(int sock, const char *topic_text)
{
    unsigned char buffer[MQTT_BUFFER_SIZE];
    MQTTString topic = MQTTString_initializer;
    int req_qos = 0;
    int len;
    int packet_type;
    unsigned short submsgid = 0;
    int subcount = 0;
    int granted_qos = 0;

    topic.cstring = (char *)topic_text;

    len = MQTTSerialize_subscribe(buffer, sizeof(buffer), 0, 1, 1, &topic, &req_qos);
    if (len <= 0 || send_all(sock, buffer, len) != len) {
        return -1;
    }

    packet_type = MQTTPacket_read(buffer, sizeof(buffer), mqtt_read_data);
    if (packet_type != SUBACK) {
        return -1;
    }

    if (MQTTDeserialize_suback(&submsgid, 1, &subcount, &granted_qos, buffer, sizeof(buffer)) != 1 ||
        subcount != 1 ||
        granted_qos < 0x00 ||
        granted_qos > 0x02) {
        return -1;
    }

    printf("subscribed topic=%s qos=%d\n", topic_text, granted_qos);
    return 0;
}

static int subscribe_downlinks(int sock, const struct demo_config *config)
{
    char property_set_topic[256];
    char service_invoke_topic[256];

    build_topic(
        property_set_topic,
        sizeof(property_set_topic),
        config->product_key,
        config->device_key,
        "thing/property/set");
    build_topic(
        service_invoke_topic,
        sizeof(service_invoke_topic),
        config->product_key,
        config->device_key,
        "thing/service/+/invoke");

    if (subscribe_topic(sock, property_set_topic) != 0) {
        return -1;
    }

    return subscribe_topic(sock, service_invoke_topic);
}

static int publish_text(int sock, const char *topic_text, const char *payload)
{
    unsigned char buffer[MQTT_BUFFER_SIZE];
    MQTTString topic = MQTTString_initializer;
    int len;

    topic.cstring = (char *)topic_text;
    len = MQTTSerialize_publish(
        buffer,
        sizeof(buffer),
        0,
        0,
        0,
        0,
        topic,
        (unsigned char *)payload,
        (int)strlen(payload));

    if (len <= 0) {
        return -1;
    }

    return send_all(sock, buffer, len) == len ? 0 : -1;
}

static int publish_property(int sock, const struct demo_config *config)
{
    char topic[256];
    char payload[512];
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

    if (publish_text(sock, topic, payload) != 0) {
        return -1;
    }

    printf("published property topic=%s\n", topic);
    return 0;
}

static void service_identifier(
    const struct demo_config *config,
    const char *command_topic,
    char *identifier,
    size_t size)
{
    char prefix[256];
    const char suffix[] = "/invoke";
    const char *start;
    const char *end;
    size_t len;

    snprintf(identifier, size, "unknown");
    build_topic(
        prefix,
        sizeof(prefix),
        config->product_key,
        config->device_key,
        "thing/service/");

    start = strstr(command_topic, prefix);
    if (start != command_topic) {
        return;
    }

    start += strlen(prefix);
    end = strstr(start, suffix);
    if (!end || end <= start) {
        return;
    }

    len = (size_t)(end - start);
    if (len >= size) {
        len = size - 1;
    }
    memcpy(identifier, start, len);
    identifier[len] = '\0';
}

static int extract_json_string(
    const unsigned char *payload,
    int payload_len,
    const char *key,
    char *value,
    size_t size)
{
    char text[512];
    char pattern[64];
    const char *start;
    const char *end;
    size_t len;

    if (size == 0 || payload_len <= 0) {
        return 0;
    }

    len = (size_t)payload_len;
    if (len >= sizeof(text)) {
        len = sizeof(text) - 1;
    }
    memcpy(text, payload, len);
    text[len] = '\0';

    snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
    start = strstr(text, pattern);
    if (!start) {
        return 0;
    }

    start += strlen(pattern);
    end = strchr(start, '"');
    if (!end || end <= start) {
        return 0;
    }

    len = (size_t)(end - start);
    if (len >= size) {
        len = size - 1;
    }
    memcpy(value, start, len);
    value[len] = '\0';
    return 1;
}

static int reply_service_command(
    int sock,
    const struct demo_config *config,
    const char *command_topic,
    const unsigned char *request_payload,
    int request_payload_len)
{
    char identifier[128];
    char reply_topic[256];
    char request_id[128];
    char payload[512];
    long long now_ms = (long long)time(NULL) * 1000;

    service_identifier(config, command_topic, identifier, sizeof(identifier));
    if (!extract_json_string(
            request_payload,
            request_payload_len,
            "request_id",
            request_id,
            sizeof(request_id)) &&
        !extract_json_string(
            request_payload,
            request_payload_len,
            "id",
            request_id,
            sizeof(request_id))) {
        snprintf(request_id, sizeof(request_id), "%lld", now_ms);
    }
    snprintf(
        reply_topic,
        sizeof(reply_topic),
        "/sys/%s/%s/thing/service/%s/reply",
        config->product_key,
        config->device_key,
        identifier);
    snprintf(
        payload,
        sizeof(payload),
        "{\"id\":\"%s\",\"request_id\":\"%s\",\"code\":0,\"data\":{}}",
        request_id,
        request_id);

    if (publish_text(sock, reply_topic, payload) != 0) {
        return -1;
    }

    printf("replied topic=%s\n", reply_topic);
    return 0;
}

static int is_property_set_topic(const struct demo_config *config, const char *topic_text)
{
    char property_set_topic[256];

    build_topic(
        property_set_topic,
        sizeof(property_set_topic),
        config->product_key,
        config->device_key,
        "thing/property/set");

    return strcmp(topic_text, property_set_topic) == 0;
}

static int handle_publish(int sock, const struct demo_config *config, unsigned char *buffer)
{
    unsigned char dup = 0;
    int qos = 0;
    unsigned char retained = 0;
    unsigned short packetid = 0;
    MQTTString topic = MQTTString_initializer;
    unsigned char *payload = NULL;
    int payload_len = 0;
    char topic_text[256];
    int len;

    if (MQTTDeserialize_publish(
            &dup,
            &qos,
            &retained,
            &packetid,
            &topic,
            &payload,
            &payload_len,
            buffer,
            MQTT_BUFFER_SIZE) != 1) {
        return -1;
    }

    mqtt_string_to_c(&topic, topic_text, sizeof(topic_text));
    printf("downlink topic=%s payload=%.*s\n", topic_text, payload_len, payload);

    if (qos == 1) {
        len = MQTTSerialize_ack(buffer, MQTT_BUFFER_SIZE, PUBACK, 0, packetid);
        if (len <= 0 || send_all(sock, buffer, len) != len) {
            return -1;
        }
    }

    if (is_property_set_topic(config, topic_text)) {
        return publish_property(sock, config);
    }

    return reply_service_command(sock, config, topic_text, payload, payload_len);
}

static void send_disconnect(int sock)
{
    unsigned char buffer[MQTT_BUFFER_SIZE];
    int len = MQTTSerialize_disconnect(buffer, sizeof(buffer));
    if (len > 0) {
        send_all(sock, buffer, len);
    }
}

int main(void)
{
    struct demo_config config = {
        .host = env_or_default("MQTT_HOST", "localhost"),
        .port = atoi(env_or_default("MQTT_PORT", "1883")),
        .product_key = env_or_default("PRODUCT_KEY", "pk_demo"),
        .device_key = env_or_default("DEVICE_KEY", "dk_mqtt_demo"),
        .device_secret = env_or_default("DEVICE_SECRET", "DeviceSecret123"),
    };
    unsigned char buffer[MQTT_BUFFER_SIZE];
    time_t last_ping = time(NULL);

    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);

    active_socket = open_socket(config.host, config.port);
    if (active_socket < 0) {
        fprintf(stderr, "failed to connect tcp %s:%d\n", config.host, config.port);
        return 1;
    }

    if (send_connect(active_socket, &config) != 0 ||
        subscribe_downlinks(active_socket, &config) != 0 ||
        publish_property(active_socket, &config) != 0) {
        close(active_socket);
        return 1;
    }

    while (running) {
        int packet_type = MQTTPacket_read(buffer, sizeof(buffer), mqtt_read_data);

        if (packet_type == PUBLISH) {
            if (handle_publish(active_socket, &config, buffer) != 0) {
                break;
            }
        } else if (packet_type == PINGRESP) {
            last_ping = time(NULL);
        } else if (time(NULL) - last_ping >= 30) {
            int len = MQTTSerialize_pingreq(buffer, sizeof(buffer));
            if (len <= 0 || send_all(active_socket, buffer, len) != len) {
                break;
            }
            last_ping = time(NULL);
        }
    }

    send_disconnect(active_socket);
    close(active_socket);
    active_socket = -1;
    return 0;
}
