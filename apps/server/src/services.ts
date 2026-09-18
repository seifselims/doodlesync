import { createAuth } from "@doodlesync/auth";
import { createDb } from "@doodlesync/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
