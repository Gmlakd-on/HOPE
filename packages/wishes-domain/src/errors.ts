export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidWishError extends DomainError {
  constructor(message: string) {
    super(message, "INVALID_WISH", 400);
  }
}

export class WishRateLimitError extends DomainError {
  constructor() {
    super("잠시 후 다시 소원을 남겨주세요.", "RATE_LIMITED", 429);
  }
}
