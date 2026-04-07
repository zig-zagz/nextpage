export class NextDistilError extends Error {
  public readonly details?: string[] | undefined;

  public constructor(message: string, details?: string[]) {
    super(message);
    this.name = "NextDistilError";
    this.details = details;
  }
}
