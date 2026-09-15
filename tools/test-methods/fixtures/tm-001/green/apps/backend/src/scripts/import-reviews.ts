// Negative control: everything here must stay green.
//
//  - `pg` is a devDependency and is required INSIDE a function. Only an
//    operator running this script ever loads it, so the image does not need
//    it and the detector must not ask for it.
//  - a type-only import of a devDependency is erased by tsc and never reaches
//    the image.
//  - relative and node: specifiers are not packages at all.
import type { Config } from "typescript";
import path from "node:path";
import { helper } from "./helper";

export default async function importReviews() {
  const { Client } = require("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  return helper(path.resolve("."), client, {} as Config);
}
