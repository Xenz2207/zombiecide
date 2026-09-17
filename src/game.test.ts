import { describe, expect, it } from "vitest";
import { attack, closedDoorExits, createGame, discardWeapon, driveRide, driveVehicle, endActivation, equipmentReference, mapThemes, missions, moveSurvivor, openDoor, runZombiePhase, searchZone, takeObjective, tradeWeapon, useItem } from "./game";

describe("game engine", () => {
  it("charges an extra action per zombie when leaving a zone", () => {
    const game = createGame(1);
    game.survivors[0].zoneId = "h";
    const moved = moveSurvivor(game, "l");
    expect(moved.survivors[0].zoneId).toBe("l");
    expect(moved.survivors[0].actions).toBe(1);
  });

  it("requires a closed door to be opened before moving", () => {
    const game = createGame(1);
    game.survivors[0].zoneId = "b";
    expect(moveSurvivor(game, "f").survivors[0].zoneId).toBe("b");
    const opened = openDoor(game, "f");
    const moved = moveSurvivor(opened, "f");
    expect(moved.survivors[0].zoneId).toBe("f");
    expect(moved.survivors[0].actions).toBe(1);
  });

  it("keeps closed doors discoverable until they are opened", () => {
    const game = createGame(1);
    game.survivors[0].zoneId = "h";

    expect(closedDoorExits(game, "b")).toEqual(["f"]);
    expect(closedDoorExits(game, "f")).toEqual(["b"]);

    game.survivors[0].zoneId = "b";
    const opened = openDoor(game, "f");
    expect(closedDoorExits(opened, "b")).toEqual([]);
    expect(closedDoorExits(opened, "f")).toEqual([]);
  });

  it("allows only one search per activation", () => {
    const game = createGame(2);
    game.survivors[0].zoneId = "f";
    const searched = searchZone(game);
    const searchedAgain = searchZone(searched);
    expect(searched.survivors[0].inventory).toHaveLength(2);
    expect(searchedAgain.survivors[0].inventory).toHaveLength(2);
  });

  it("awards objective adrenaline and records progress", () => {
    const game = createGame(1);
    game.survivors[0].zoneId = "a";
    const result = takeObjective(game);
    expect(result.objectives).toEqual(["a"]);
    expect(result.survivors[0].adrenaline).toBe(5);
  });

  it("resolves deterministic combat", () => {
    const game = createGame(1);
    game.survivors[0].zoneId = "e";
    game.survivors[0].inventory[0].accuracy = 1;
    const result = attack(game, "bat", "e");
    expect(result.zombies.some((zombie) => zombie.zoneId === "e")).toBe(false);
    expect(result.survivors[0].adrenaline).toBe(1);
  });

  it("runs zombies and starts a fresh round after all survivors end", () => {
    let game = createGame(3);
    for (let index = 0; index < 6; index += 1) game = endActivation(game);
    expect(game.round).toBe(2);
    expect(game.phase).toBe("player");
    expect(game.survivors.every((survivor) => survivor.actions === 3)).toBe(true);
    expect(game.zombies.length).toBeGreaterThan(3);
  });

  it("lets Mali search twice but not three times", () => {
    let game = createGame(7);
    game.activeSurvivorId = "mali";
    game.survivors.find((survivor) => survivor.id === "mali")!.zoneId = "f";
    game = searchZone(game);
    game = searchZone(game);
    const afterTwoSearches = game.survivors.find((survivor) => survivor.id === "mali")!;
    expect(afterTwoSearches.inventory).toHaveLength(3);
    game = searchZone(game);
    expect(game.survivors.find((survivor) => survivor.id === "mali")!.inventory).toHaveLength(3);
  });

  it("gives Nont a free disengage surcharge on his first move", () => {
    const game = createGame(8);
    game.activeSurvivorId = "nont";
    const nont = game.survivors.find((survivor) => survivor.id === "nont")!;
    nont.zoneId = "h";
    const moved = moveSurvivor(game, "l");
    expect(moved.survivors.find((survivor) => survivor.id === "nont")!.actions).toBe(2);
  });

  it("trades equipment with a survivor in the same zone for one action", () => {
    const game = createGame(9);
    const result = tradeWeapon(game, "bat", "jin");
    expect(result.survivors[0].inventory).toHaveLength(0);
    expect(result.survivors[1].inventory).toHaveLength(2);
    expect(result.survivors[0].actions).toBe(2);
  });

  it("loads mission-specific objectives, spawn zones and extraction", () => {
    const game = createGame(10, "last-dose");
    expect(game.zones.filter((zone) => zone.objective).map((zone) => zone.id)).toEqual(["a", "f", "g"]);
    expect(game.zones.filter((zone) => zone.spawn).map((zone) => zone.id)).toEqual(["d", "i", "l"]);
    expect(game.zones.find((zone) => zone.extraction)?.id).toBe("h");
    expect(game.survivors.every((survivor) => survivor.zoneId === "h")).toBe(true);
  });

  it("offers twenty-five unique missions with harder late-game setups", () => {
    expect(missions).toHaveLength(25);
    expect(new Set(missions.map((mission) => mission.id)).size).toBe(25);
    for (const mission of missions.slice(4, 9)) {
      expect(mission.objectiveZoneIds.length).toBeGreaterThanOrEqual(3);
      expect(mission.spawnZoneIds.length).toBeGreaterThanOrEqual(4);
      expect(mission.initialZombies.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("loads the harbor map and vehicle for mission ten", () => {
    const game = createGame(13, "sealed-harbor");
    expect(game.zones.map((zone) => zone.id)).toEqual(["m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x"]);
    expect(game.vehicleZoneId).toBe("q");
    expect(game.zombies.some((zombie) => zombie.kind === "crawler")).toBe(true);
    expect(game.zombies.some((zombie) => zombie.kind === "spitter")).toBe(true);
  });

  it("drives every survivor in the vehicle zone for one action", () => {
    const game = createGame(14, "sealed-harbor");
    for (const survivor of game.survivors) survivor.zoneId = "q";
    const result = driveVehicle(game, "r");
    expect(result.vehicleZoneId).toBe("r");
    expect(result.survivors.every((survivor) => survivor.zoneId === "r")).toBe(true);
    expect(result.survivors[0].actions).toBe(2);
  });

  it("unlocks an extra attack die at nineteen adrenaline", () => {
    const game = createGame(15);
    game.survivors[0].zoneId = "e";
    game.survivors[0].adrenaline = 19;
    game.survivors[0].inventory[0].accuracy = 1;
    const result = attack(game, "bat", "e");
    expect(result.lastRoll).toHaveLength(3);
  });

  it("lets a spitter attack a survivor in an adjacent zone", () => {
    const game = createGame(16, "sealed-harbor");
    game.zombies = [{ id: 1, kind: "spitter", zoneId: "n" }];
    game.survivors[1].zoneId = "m";
    const result = runZombiePhase(game);
    expect(result.survivors[1].health).toBe(2);
  });

  it("adds three advanced weapons to the equipment pool", () => {
    expect(equipmentReference.filter((weapon) => ["katana", "crossbow", "flamethrower"].includes(weapon.id))).toHaveLength(3);
  });

  it("loads the amusement map with its themed rides and zombies", () => {
    const game = createGame(17, "park-after-dark");
    expect(game.zones.map((zone) => zone.id)).toEqual(["aa", "ab", "ac", "ad", "ae", "af", "ag", "ah", "ai", "aj", "ak", "al"]);
    expect(game.rides.map((ride) => ride.kind)).toEqual(["coaster", "bumper"]);
    expect(game.zombies.some((zombie) => zombie.kind === "clown")).toBe(true);
    expect(game.zombies.some((zombie) => zombie.kind === "mascot")).toBe(true);
    expect(mapThemes.amusement.items).toContain("สายไหมพลังงาน");
  });

  it("uses the coaster to carry everyone in its zone", () => {
    const game = createGame(18, "park-after-dark");
    for (const survivor of game.survivors) survivor.zoneId = "aa";
    const result = driveRide(game, "coaster", "ae");
    expect(result.rides.find((ride) => ride.id === "coaster")?.zoneId).toBe("ae");
    expect(result.survivors.every((survivor) => survivor.zoneId === "ae")).toBe(true);
  });

  it("uses the bumper car to carry only its driver", () => {
    const game = createGame(19, "park-after-dark");
    for (const survivor of game.survivors) survivor.zoneId = "ab";
    const result = driveRide(game, "bumper", "af");
    expect(result.survivors[0].zoneId).toBe("af");
    expect(result.survivors.slice(1).every((survivor) => survivor.zoneId === "ab")).toBe(true);
  });

  it("makes a mascot attack for two damage", () => {
    const game = createGame(20, "park-after-dark");
    game.zombies = [{ id: 1, kind: "mascot", zoneId: "ac" }];
    game.survivors[1].zoneId = "ac";
    const result = runZombiePhase(game);
    expect(result.survivors[1].health).toBe(1);
  });

  it("adds three amusement-park items to the equipment pool", () => {
    expect(equipmentReference.filter((weapon) => ["shock-baton", "fireworks", "cotton-candy"].includes(weapon.id))).toHaveLength(3);
  });

  it("rolls dice only when using an item and resolves its condition", () => {
    const game = createGame(11);
    const medkit = equipmentReference.find((item) => item.id === "medkit")!;
    game.survivors[0].health = 2;
    game.survivors[0].inventory.push({ ...medkit, accuracy: 1 });
    const result = useItem(game, "medkit");
    expect(result.lastRoll).toHaveLength(1);
    expect(result.survivors[0].health).toBe(3);
    expect(result.survivors[0].actions).toBe(2);
    expect(result.survivors[0].inventory.some((item) => item.id === "medkit")).toBe(false);
  });

  it("discards equipment without spending an action", () => {
    const game = createGame(12);
    const result = discardWeapon(game, "bat");
    expect(result.survivors[0].inventory).toHaveLength(0);
    expect(result.survivors[0].actions).toBe(3);
  });
});
