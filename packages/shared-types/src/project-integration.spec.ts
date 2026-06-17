import { z } from "zod";
import { nextNewLegId } from "@theforge/shared-types";

describe("nextNewLegId", () => {
  it("starts at NEW-LEG-01", () => {
    expect(nextNewLegId([])).toBe("NEW-LEG-01");
  });

  it("increments from max existing", () => {
    expect(nextNewLegId([{ id: "NEW-LEG-03" }, { id: "NEW-LEG-01" }])).toBe("NEW-LEG-04");
  });
});
