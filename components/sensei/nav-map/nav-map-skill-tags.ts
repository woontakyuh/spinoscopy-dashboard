// Tag → Position id mapping used for node skill levels on the nav map.
const TAG_TO_POS_ID: Record<string, string> = {
  HG: "hg", DHG: "dhg", DLR: "dlr", RDLR: "rdlr", SLX: "slx", XG: "xg",
  Butterfly: "butterfly", Closed: "closed", Open: "open", Spider: "spider",
  Lasso: "lasso", "Sit-up": "situp", Lapel: "lapel", Worm: "worm",
  RWorm: "rworm", Squid: "squid", Octopus: "octopus", Rubber: "rubber",
  CrabRide: "crabride", Truck: "truck", KShield: "kshield", Waiter: "waiter",
  KGuard: "kguard", HalfButt: "halfbutt", Bolo: "bolo",
  KCP: "kcp", Torreando: "torreando", Stack: "smash", Smash: "smash",
  LegPummel: "legpummel", HalfPass: "halfpass", LongStep: "longstep",
  Bullfight: "bullfight", HQ: "hq",
  Mount: "mount_top", "S-Mount": "mount_top", SideCtrl: "side_top",
  BackTake: "back_top", BackMount: "back_top", KoB: "kob_top",
  NS: "ns_top", Scarf: "scarf", Turtle: "turtle_top", Crucifix: "crucifix",
  RNC: "rnc", Anaconda: "anaconda", Darce: "darce", Guillotine: "guillotine",
  Omo: "omoplata", Triangle: "triangle", ArmB: "armb", Kimura: "kimura",
  Americana: "americana", BowArrow: "bowarrow", CrossChoke: "crosschoke",
  Ezekiel: "ezekiel", Baseball: "baseball", NSChoke: "nschoke",
  ArmTriangle: "armtriangle", Gogoplata: "gogoplata", Wristlock: "wristlock",
  Takedown: "standing", SingleLeg: "standing", DoubleLeg: "standing",
  JudoThrow: "standing", Throw: "standing", GPull: "standing",
  ArmDrag: "armdrag", AnklePick: "standing", WrestleUp: "standing",
  Bodylock: "standing", InsideTrip: "standing",
  IHH: "ihh", OHH: "ohh", Estima: "estima", ToeHold: "toehold",
  KneeBar: "kneebar", SFL: "sfl", "50/50": "5050",
  Ashi: "ashi", SLAshi: "slashi", Saddle: "saddle", OutAshi: "outashi",
}

export function buildPositionSkillMap(
  tagFrequencies: Record<string, number>,
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const [tag, count] of Object.entries(tagFrequencies)) {
    const posId = TAG_TO_POS_ID[tag] ?? tag.toLowerCase()
    map[posId] = (map[posId] ?? 0) + count
  }
  return map
}
