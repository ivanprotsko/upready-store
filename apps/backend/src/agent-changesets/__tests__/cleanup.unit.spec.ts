import { KEEP_PUBLISHED_DAYS, publishedCutoff, removeOldPublishedChangesets } from "../cleanup";

describe("agent changeset cleanup (t-2026-10-27-04)", () => {
  it("keeps a published changeset 90 days", () => {
    expect(KEEP_PUBLISHED_DAYS).toBe(90);
    expect(publishedCutoff(new Date("2026-10-27T00:00:00Z")).toISOString()).toBe("2026-07-29T00:00:00.000Z");
  });

  it("removes only published and rolled-back rows past the cutoff", async () => {
    const list = jest.fn().mockResolvedValue([{ id: "achg_1" }, { id: "achg_2" }]);
    const remove = jest.fn().mockResolvedValue(undefined);
    const container = { resolve: () => ({ listAgentChangesets: list, deleteAgentChangesets: remove }) };

    const removed = await removeOldPublishedChangesets(container as never, new Date("2026-10-27T00:00:00Z"));

    expect(removed).toBe(2);
    expect(list.mock.calls[0][0]).toEqual({
      status: ["published", "rolled_back"],
      published_at: { $lt: new Date("2026-07-29T00:00:00.000Z") },
    });
    expect(remove).toHaveBeenCalledWith(["achg_1", "achg_2"]);
  });

  it("touches nothing when nothing is old", async () => {
    const remove = jest.fn();
    const container = { resolve: () => ({ listAgentChangesets: async () => [], deleteAgentChangesets: remove }) };
    expect(await removeOldPublishedChangesets(container as never)).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });
});
