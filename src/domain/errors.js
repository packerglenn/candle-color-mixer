export class DomainError extends Error {
  constructor(code, message, fieldPath = null) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldPath = fieldPath;
  }
}

export function diagnostic(code, severity, message, fieldPath = null) {
  return Object.freeze({ code, severity, message, fieldPath });
}
