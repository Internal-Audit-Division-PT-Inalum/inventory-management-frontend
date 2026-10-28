import { setupServer } from "msw/node";
import { transactionHandlers } from "./handlers";

export const server = setupServer(...transactionHandlers);
