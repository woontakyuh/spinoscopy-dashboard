// BJJ Tag Reference v2 — 6축 카테고리 체계
// 약어 원칙: 통용 약어(DLR, SLX, RNC 등)는 유지, 나머지는 직관적 풀네임

export type TagCategory = "Guard" | "Passing" | "Control" | "Finishing" | "Takedowns" | "LegLocks" | "Meta"

export const TAG_CATEGORIES: Record<TagCategory, Record<string, string>> = {
  Guard: {
    HG: "Half Guard",
    DHG: "Deep Half Guard",
    DLR: "De La Riva",
    RDLR: "Reverse De La Riva",
    SLX: "Single Leg X",
    XG: "X-Guard",
    Butterfly: "Butterfly Guard",
    Closed: "Closed Guard",
    Open: "Open Guard",
    Spider: "Spider Guard",
    Lasso: "Lasso Guard",
    "Sit-up": "Sit-up Guard",
    Lapel: "Lapel Guard",
    Worm: "Worm Guard",
    RWorm: "Reverse Worm Guard",
    Squid: "Squid Guard",
    Octopus: "Octopus Guard",
    Rubber: "Rubber Guard",
    CrabRide: "Crab Ride",
    Truck: "Truck",
    KShield: "Knee Shield / Z-Guard",
    Waiter: "Waiter Guard",
    KGuard: "K-Guard",
    HalfButt: "Half Butterfly",
    Bolo: "Berimbolo",
    SingleSweep: "Single Leg Sweep",
    HipSweep: "Hip Sweep",
    Scissor: "Scissor Sweep",
  },
  Passing: {
    KCP: "Knee Cut Pass",
    Torreando: "Torreando Pass",
    Stack: "Stack Pass",
    Smash: "Smash Pass",
    LegPummel: "Leg Pummeling Pass",
    HalfPass: "Half Guard Pass",
    LongStep: "Long Step Pass",
    Bullfight: "Bullfight Pass",
    HQ: "Headquarters",
  },
  Control: {
    Mount: "Mount",
    "S-Mount": "S-Mount",
    SideCtrl: "Side Control",
    BackTake: "Back Take",
    BackMount: "Back Mount",
    KoB: "Knee on Belly",
    NS: "North-South",
    Scarf: "Scarf Hold",
    Turtle: "Turtle",
    Crucifix: "Crucifix",
  },
  Finishing: {
    RNC: "Rear Naked Choke",
    Anaconda: "Anaconda Choke",
    Darce: "Darce Choke",
    Guillotine: "Guillotine",
    Omo: "Omoplata",
    Triangle: "Triangle",
    Gogoplata: "Gogoplata",
    BicepSlicer: "Bicep Slicer",
    ArmB: "Armbar",
    Kimura: "Kimura",
    Americana: "Americana",
    Wristlock: "Wrist Lock",
    BowArrow: "Bow and Arrow Choke",
    CrossChoke: "Cross Collar Choke",
    Ezekiel: "Ezekiel Choke",
    ArmTriangle: "Arm Triangle",
    Baseball: "Baseball Bat Choke",
    NSChoke: "North-South Choke",
  },
  Takedowns: {
    Takedown: "Takedown",
    SingleLeg: "Single Leg",
    DoubleLeg: "Double Leg",
    Bodylock: "Body Lock",
    JudoThrow: "Judo Throw",
    InsideTrip: "Inside Trip",
    Throw: "Throw",
    GPull: "Guard Pull",
    ArmDrag: "Arm Drag",
    AnklePick: "Ankle Pick",
    WrestleUp: "Wrestle Up",
  },
  LegLocks: {
    IHH: "Inside Heel Hook",
    OHH: "Outside Heel Hook",
    Estima: "Estima Lock",
    ToeHold: "Toe Hold",
    KneeBar: "Kneebar",
    SFL: "Straight Footlock",
    "50/50": "50/50",
    Ashi: "Ashi Garami",
    SLAshi: "Single Leg Ashi",
    Saddle: "Saddle / Honey Hole",
    OutAshi: "Outside Ashi",
  },
  Meta: {
    Gi: "Gi",
    NoGi: "No-Gi",
  },
}

// Flat reference map (abbr → full name) for backward compat
export const BJJ_TAG_REFERENCE: Record<string, string> = Object.values(TAG_CATEGORIES).reduce(
  (acc, cat) => ({ ...acc, ...cat }),
  {} as Record<string, string>,
)

// Category lookup: abbr → category name
export const TAG_TO_CATEGORY: Record<string, TagCategory> = {}
for (const [category, tags] of Object.entries(TAG_CATEGORIES)) {
  for (const abbr of Object.keys(tags)) {
    TAG_TO_CATEGORY[abbr] = category as TagCategory
  }
}

export function buildTagReferencePrompt(): string {
  const sections: string[] = []
  for (const [category, tags] of Object.entries(TAG_CATEGORIES)) {
    if (category === "Meta") continue
    const lines = Object.entries(tags).map(([abbr, full]) => `${abbr} = ${full}`)
    sections.push(`[${category}]\n${lines.join("\n")}`)
  }
  sections.push("[Meta]\nGi = Gi\nNoGi = No-Gi")
  return sections.join("\n\n")
}
