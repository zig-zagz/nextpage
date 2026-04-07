export class NextPackAiError extends Error {
  public readonly details?: string[] | undefined;

  public constructor(message: string, details?: string[]) {
    super(message);
    this.name = "NextPackAiError";
    this.details = details;
  }
}
