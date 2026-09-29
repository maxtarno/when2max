import type { GridInfo } from "./types";

// Tags that mark window.postMessage traffic between the content script and the page-world script.
export const FROM_CS = "when2max:cs";
export const FROM_PAGE = "when2max:page";

/** Requests from the content script. Each is sent with a reqId that the reply echoes. */
export type CsToPage = { type: "getGrid" } | { type: "apply"; free: number[] };

export type PageToCs =
  | { type: "loggedIn"; grid: GridInfo | null }
  | { type: "grid"; reqId: number; grid: GridInfo | null }
  | { type: "applied"; reqId: number; added: number; removed: number }
  | { type: "applyFailed"; reqId: number; error: string };
