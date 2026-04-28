export type ErrorDefinition = {
  code: number;
  httpStatus: number;
  message: string;
};

export const ERROR_DEFINITIONS = {
  0: { code: 0, httpStatus: 200, message: "成功" },
  400001: { code: 400001, httpStatus: 400, message: "参数错误" },
  401001: { code: 401001, httpStatus: 401, message: "未登录或 Token 失效" },
  403001: { code: 403001, httpStatus: 403, message: "无权限" },
  404001: { code: 404001, httpStatus: 404, message: "资源不存在" },
  409001: { code: 409001, httpStatus: 409, message: "资源冲突" },
  429001: { code: 429001, httpStatus: 429, message: "请求过频" },
  500001: { code: 500001, httpStatus: 500, message: "系统错误" },
  504001: { code: 504001, httpStatus: 504, message: "设备响应超时" }
} satisfies Record<number, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

export function getErrorDefinition(code: ErrorCode): ErrorDefinition {
  return ERROR_DEFINITIONS[code];
}
