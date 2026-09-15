// Negative control: a unit test beside the code it covers. Part of the
// repository's own gates, not a throwaway acceptance fixture — even though it
// is, literally, test code in a compiled tree.
import { describe, it } from "node:test";
describe("categoryImage", () => it("stays green", () => {}));
