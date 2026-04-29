#include <arpa/inet.h>
#include <errno.h>
#include <netdb.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/sha.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

#define BUFFER_SIZE 16384
#define SMALL_SIZE 512

struct demo_config {
    const char *base_url;
    const char *product_key;
    const char *device_key;
    const char *device_secret;
    char host[256];
    int port;
};

struct http_response {
    int status;
    char body[BUFFER_SIZE];
};

static const char *env_or_default(const char *name, const char *fallback)
{
    const char *value = getenv(name);
    return value && value[0] ? value : fallback;
}

static int parse_base_url(const char *url, char *host, size_t host_size, int *port)
{
    const char *start = url;
    const char *slash;
    const char *colon;
    size_t len;

    if (strncmp(start, "http://", 7) == 0) {
        start += 7;
    } else if (strncmp(start, "https://", 8) == 0) {
        fprintf(stderr, "https is not supported by this lightweight demo\n");
        return -1;
    }

    slash = strchr(start, '/');
    len = slash ? (size_t)(slash - start) : strlen(start);
    if (len == 0 || len >= host_size) {
        return -1;
    }

    colon = memchr(start, ':', len);
    if (colon) {
        size_t host_len = (size_t)(colon - start);
        if (host_len == 0 || host_len >= host_size) {
            return -1;
        }
        memcpy(host, start, host_len);
        host[host_len] = '\0';
        *port = atoi(colon + 1);
        if (*port <= 0) {
            return -1;
        }
    } else {
        memcpy(host, start, len);
        host[len] = '\0';
        *port = 80;
    }

    return 0;
}

static long long now_millis(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (long long)ts.tv_sec * 1000LL + ts.tv_nsec / 1000000LL;
}

static void hex_encode(const unsigned char *input, unsigned int len, char *output)
{
    static const char hex[] = "0123456789abcdef";
    unsigned int i;

    for (i = 0; i < len; ++i) {
        output[i * 2] = hex[input[i] >> 4];
        output[i * 2 + 1] = hex[input[i] & 0x0f];
    }
    output[len * 2] = '\0';
}

static void sha256_hex(const char *text, char *output)
{
    unsigned char digest[SHA256_DIGEST_LENGTH];
    SHA256((const unsigned char *)text, strlen(text), digest);
    hex_encode(digest, SHA256_DIGEST_LENGTH, output);
}

static void hmac_sha256_hex(const char *secret, const char *message, char *output)
{
    unsigned char digest[EVP_MAX_MD_SIZE];
    unsigned int digest_len = 0;

    HMAC(
        EVP_sha256(),
        secret,
        (int)strlen(secret),
        (const unsigned char *)message,
        strlen(message),
        digest,
        &digest_len);
    hex_encode(digest, digest_len, output);
}

static int open_socket(const char *host, int port)
{
    struct addrinfo hints;
    struct addrinfo *result = NULL;
    struct addrinfo *rp = NULL;
    char port_text[16];
    int sock = -1;

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
    return sock;
}

static int send_all(int sock, const char *buffer, size_t length)
{
    size_t sent = 0;

    while (sent < length) {
        ssize_t rc = send(sock, buffer + sent, length - sent, 0);
        if (rc <= 0) {
            return -1;
        }
        sent += (size_t)rc;
    }

    return 0;
}

static int read_response(int sock, struct http_response *response)
{
    char buffer[BUFFER_SIZE];
    char *body;
    char *status_start;
    ssize_t rc;
    size_t used = 0;

    memset(buffer, 0, sizeof(buffer));
    while ((rc = recv(sock, buffer + used, sizeof(buffer) - used - 1, 0)) > 0) {
        used += (size_t)rc;
        if (used >= sizeof(buffer) - 1) {
            break;
        }
    }
    buffer[used] = '\0';

    status_start = strchr(buffer, ' ');
    response->status = status_start ? atoi(status_start + 1) : 0;
    body = strstr(buffer, "\r\n\r\n");
    if (!body) {
        response->body[0] = '\0';
        return -1;
    }

    snprintf(response->body, sizeof(response->body), "%s", body + 4);
    if (strstr(buffer, "Transfer-Encoding: chunked") ||
        strstr(buffer, "transfer-encoding: chunked")) {
        char decoded[BUFFER_SIZE];
        const char *cursor = response->body;
        size_t decoded_len = 0;

        while (*cursor) {
            char *endptr;
            long chunk_len = strtol(cursor, &endptr, 16);
            if (endptr == cursor || chunk_len <= 0) {
                break;
            }
            cursor = endptr;
            if (cursor[0] == '\r' && cursor[1] == '\n') {
                cursor += 2;
            }
            if (decoded_len + (size_t)chunk_len >= sizeof(decoded)) {
                break;
            }
            memcpy(decoded + decoded_len, cursor, (size_t)chunk_len);
            decoded_len += (size_t)chunk_len;
            cursor += chunk_len;
            if (cursor[0] == '\r' && cursor[1] == '\n') {
                cursor += 2;
            }
        }

        decoded[decoded_len] = '\0';
        snprintf(response->body, sizeof(response->body), "%s", decoded);
    }
    return 0;
}

static void build_signature_headers(
    const struct demo_config *config,
    const char *method,
    const char *path,
    const char *body,
    char *headers,
    size_t headers_size)
{
    char timestamp[32];
    char nonce[96];
    char body_sha256[SHA256_DIGEST_LENGTH * 2 + 1];
    char canonical[1024];
    char signature[EVP_MAX_MD_SIZE * 2 + 1];

    snprintf(timestamp, sizeof(timestamp), "%lld", now_millis());
    snprintf(nonce, sizeof(nonce), "nonce_%s_%ld", timestamp, random());
    sha256_hex(body, body_sha256);
    snprintf(
        canonical,
        sizeof(canonical),
        "%s\n%s\n%s\n%s\n%s",
        method,
        path,
        timestamp,
        nonce,
        body_sha256);
    hmac_sha256_hex(config->device_secret, canonical, signature);

    snprintf(
        headers,
        headers_size,
        "Content-Type: application/json\r\n"
        "x-ziot-product-key: %s\r\n"
        "x-ziot-device-key: %s\r\n"
        "x-ziot-device-secret: %s\r\n"
        "x-ziot-timestamp: %s\r\n"
        "x-ziot-nonce: %s\r\n"
        "x-ziot-body-sha256: %s\r\n"
        "x-ziot-signature: %s\r\n",
        config->product_key,
        config->device_key,
        config->device_secret,
        timestamp,
        nonce,
        body_sha256,
        signature);
}

static int http_request(
    const struct demo_config *config,
    const char *method,
    const char *path,
    const char *body,
    struct http_response *response)
{
    int sock;
    char headers[2048];
    char request_text[BUFFER_SIZE];

    build_signature_headers(config, method, path, body, headers, sizeof(headers));
    snprintf(
        request_text,
        sizeof(request_text),
        "%s %s HTTP/1.1\r\n"
        "Host: %s:%d\r\n"
        "%s"
        "Content-Length: %zu\r\n"
        "Connection: close\r\n"
        "\r\n"
        "%s",
        method,
        path,
        config->host,
        config->port,
        headers,
        strlen(body),
        body);

    sock = open_socket(config->host, config->port);
    if (sock < 0) {
        fprintf(stderr, "connect failed %s:%d\n", config->host, config->port);
        return -1;
    }

    if (send_all(sock, request_text, strlen(request_text)) != 0 ||
        read_response(sock, response) != 0) {
        close(sock);
        return -1;
    }

    close(sock);

    if (response->status < 200 || response->status >= 300) {
        fprintf(stderr, "request failed status=%d body=%s\n", response->status, response->body);
        return -1;
    }

    return 0;
}

static int extract_json_string(const char *json, const char *key, char *out, size_t out_size)
{
    char pattern[64];
    const char *start;
    const char *end;
    size_t len;

    snprintf(pattern, sizeof(pattern), "\"%s\":\"", key);
    start = strstr(json, pattern);
    if (!start) {
        return -1;
    }
    start += strlen(pattern);
    end = strchr(start, '"');
    if (!end) {
        return -1;
    }

    len = (size_t)(end - start);
    if (len >= out_size) {
        len = out_size - 1;
    }
    memcpy(out, start, len);
    out[len] = '\0';
    return 0;
}

static int report_properties(const struct demo_config *config)
{
    struct http_response response;
    char body[SMALL_SIZE];

    snprintf(
        body,
        sizeof(body),
        "{\"id\":\"%lld\",\"params\":{\"temperature\":23.6,\"humidity\":58}}",
        now_millis());

    if (http_request(config, "POST", "/device-api/v1/properties", body, &response) != 0) {
        return -1;
    }

    printf("reported properties %s\n", response.body);
    return 0;
}

static int poll_and_reply_commands(const struct demo_config *config)
{
    struct http_response response;
    char request_id[128];
    char identifier[128];
    char path[256];
    char body[SMALL_SIZE];

    if (http_request(config, "GET", "/device-api/v1/commands/pending", "", &response) != 0) {
        return -1;
    }

    if (strstr(response.body, "\"data\":[]")) {
        printf("pending commands=0\n");
        return 0;
    }

    if (extract_json_string(response.body, "request_id", request_id, sizeof(request_id)) != 0) {
        printf("pending commands=0\n");
        return 0;
    }
    if (extract_json_string(response.body, "identifier", identifier, sizeof(identifier)) != 0) {
        snprintf(identifier, sizeof(identifier), "unknown");
    }

    printf("pending commands=1\n");
    snprintf(path, sizeof(path), "/device-api/v1/commands/%s/reply", request_id);
    snprintf(
        body,
        sizeof(body),
        "{\"code\":0,\"data\":{\"identifier\":\"%s\",\"ok\":true}}",
        identifier);

    if (http_request(config, "POST", path, body, &response) != 0) {
        return -1;
    }

    printf("replied command=%s %s\n", request_id, response.body);
    return 0;
}

int main(void)
{
    struct demo_config config;

    srandom((unsigned int)time(NULL));

    config.base_url = env_or_default("HTTP_DEVICE_API_URL", "http://localhost:3000");
    config.product_key = env_or_default("PRODUCT_KEY", "pk_demo");
    config.device_key = env_or_default("DEVICE_KEY", "dk_mqtt_demo");
    config.device_secret = env_or_default("DEVICE_SECRET", "DeviceSecret123");

    if (parse_base_url(config.base_url, config.host, sizeof(config.host), &config.port) != 0) {
        fprintf(stderr, "invalid HTTP_DEVICE_API_URL=%s\n", config.base_url);
        return 1;
    }

    printf(
        "http device demo base_url=%s product_key=%s device_key=%s\n",
        config.base_url,
        config.product_key,
        config.device_key);

    if (report_properties(&config) != 0) {
        return 1;
    }

    if (poll_and_reply_commands(&config) != 0) {
        return 1;
    }

    return 0;
}
