// Story missions + side jobs. Six story missions from Rosa, Eddie and the crew,
// plus repeatable taxi fares and 12 hidden Sun Coins to collect around the city.
// A mission is a small state machine: {id, title, giver, brief, steps[]} where a
// step is {kind, target, radius, text, ...}. The game drives it via update().
export const STORY = [
  {
    id: 'm1', title: 'WHEELS UP', giver: 'ROSA',
    brief: "Rosa: Dario, my driver quit. Steal any car on the street and bring it to my garage. Don't scratch it. Much.",
    steps: [
      { kind: 'stealCar', text: 'Steal any car (walk up to one and press E)' },
      { kind: 'goto', target: 'garage', radius: 10, text: "Drive the car to Rosa's Garage" },
    ],
    reward: 300,
  },
  {
    id: 'm2', title: 'THE PACKAGE', giver: 'ROSA',
    brief: "Rosa: A package for Eddie at the docks. 90 seconds, no questions, no cops. The gold sedan by the marina is fast — take it if you can.",
    steps: [
      { kind: 'goto', target: 'docks', radius: 12, text: 'Deliver the package to the Harbor Docks', timer: 90 },
    ],
    reward: 450,
  },
  {
    id: 'm3', title: 'DOCKSIDE TROUBLE', giver: 'EDDIE',
    brief: "Eddie: The Harbor Rats jumped my boys at the docks. Go clear them out — five of them. There's an SMG stashed in the blue van nearby. Make it loud.",
    steps: [
      { kind: 'kill', count: 5, at: 'docks', text: 'Clear out the Harbor Rats at the docks (0/5)' },
    ],
    reward: 600,
  },
  {
    id: 'm4', title: 'HOT PURSUIT', giver: 'EDDIE',
    brief: "Eddie: You made the Rats angry and the cops angrier. Lose a 3-star wanted level — hide, run, survive. Stay free for 45 seconds once they lose you.",
    steps: [
      { kind: 'escape', stars: 3, hold: 45, text: 'Reach 3 stars, then lose the cops and stay free for 45s' },
    ],
    reward: 700,
  },
  {
    id: 'm5', title: 'TAXI NIGHTS', giver: 'ROSA',
    brief: "Rosa: The garage is broke and so are you. Drive the taxi — three fares, three tips. Pick them up, drop them off, don't wreck the cab.",
    steps: [
      { kind: 'taxi', count: 3, text: 'Complete 3 taxi fares (0/3)' },
    ],
    reward: 500,
  },
  {
    id: 'm6', title: 'THE BIG SCORE', giver: 'EDDIE',
    brief: "Eddie: Last job, Dario. The gold sedan at the marina belongs to the mayor's nephew. Take it, lose the 4-star heat, and bring it to my garage. Then Solmar is ours.",
    steps: [
      { kind: 'stealGold', text: 'Steal the gold sedan at the Marina' },
      { kind: 'escape', stars: 4, hold: 30, text: 'Lose the 4-star wanted level' },
      { kind: 'goto', target: 'garage', radius: 10, text: "Deliver the gold sedan to Rosa's Garage" },
    ],
    reward: 1500,
  },
];

export const TAXI_FARES = [
  { from: 'tower', to: 'beach', tip: 120 },
  { from: 'hospital', to: 'marina', tip: 140 },
  { from: 'docks', to: 'tower', tip: 150 },
  { from: 'garage', to: 'hospital', tip: 110 },
  { from: 'beach', to: 'policeHQ', tip: 130 },
];

// 12 hidden Sun Coins, scattered on sidewalks, roofs of low walls and the pier.
export const SUN_COINS = [
  [-161, -115], [-115, 161], [69, -161], [161, 23], [-23, -69], [115, 115],
  [-69, 23], [23, 161], [161, -115], [-115, -23], [92, 285], [-46, 235],
];
