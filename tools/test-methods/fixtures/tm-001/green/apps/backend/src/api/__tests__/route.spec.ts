// A test file under a boot directory: jest never runs in the runtime image,
// so its devDependency imports say nothing about whether the image can boot.
import { describe, it } from "jest";
describe("route", () => it("is skipped by the detector", () => {}));
