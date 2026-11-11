/**
 * Turns a PostgREST / Postgres error into a message that is safe to show.
 * Messages raised by Permitayo's own database functions (P0001, P0002) are
 * written for end users; anything else gets a generic message so internal
 * details are never leaked.
 */
export function dbErrorMessage(error: { code?: string; message: string } | null | undefined, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  switch (error.code) {
    case "42501":
      return "You do not have permission to do that.";
    case "P0001":
    case "P0002":
      return error.message;
    case "22023":
      return "That value is not valid.";
    case "23514":
      return "Some of the information is not in the expected format. Check the fields and try again.";
    case "23505":
      return "That record already exists.";
    case "23503":
      return "A linked record could not be found. Reload the page and try again.";
    default:
      return fallback;
  }
}
