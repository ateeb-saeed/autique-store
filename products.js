// Product catalog for Autique. Kept in one place so the server API
// and the storefront always show the same data.

const rawCategories = [
  {
    key: "gladiator",
    title: "The Gladiator Dynasty",
    tagline: "The flagship line, for those who accept nothing less than a showroom finish.",
    products: [
      { name: "Gladiator Tire Gel", price: 650, desc: "A rich gel shine that turns tyres into polished obsidian." },
      { name: "Gladiator Premium Hard Wax", price: 800, desc: "A long-lasting hard wax for a mirror-deep, showroom finish." },
      { name: "Gladiator Tire Foam", price: 500, desc: "Foams away dust and grime, leaving tyres freshly finished." },
      { name: "Gladiator Windshield Washer", price: 500, desc: "Clears road film instantly for a spotless view ahead." },
      { name: "Gladiator Compound", price: 600, desc: "Cuts through scratches and swirl marks to reveal true paint." },
      { name: "Gladiator Leather Wax", price: 650, desc: "Conditions leather seats to a soft, sultan-like sheen." }
    ]
  },
  {
    key: "sogo",
    title: "Sogo Elite Selection",
    tagline: "Everyday care, elevated — dependable formulas for the discerning driver.",
    products: [
      { name: "Sogo Multipurpose Cleaner", price: 500, desc: "One bottle, every surface — dashboards, seats and doors alike." },
      { name: "Sogo Tire Foam", price: 500, desc: "A gentle foaming formula that lifts grime, not rubber." },
      { name: "Sogo Antirust (100ml)", price: 250, desc: "Guards metal parts against rust with a fine protective coat." }
    ]
  },
  {
    key: "engine",
    title: "Engine & Fuel Nobility",
    tagline: "What happens under the bonnet, refined.",
    products: [
      { name: "Prato Petrol Injector Cleaner", price: 500, desc: "Clears petrol injectors for a smoother, more willing engine." },
      { name: "Diesel Injector Cleaner", price: 500, desc: "Restores diesel injector flow for stronger, cleaner combustion." },
      { name: "Octane Booster", price: 500, desc: "Lifts octane rating for a livelier, knock-free drive." },
      { name: "Motor Flush", price: 500, desc: "Flushes old sludge from the engine before every oil change." },
      { name: "WTB Fuel Injector Cleaner", price: 650, desc: "A premium injector treatment for renewed engine responsiveness." },
      { name: "WTB Octane Booster", price: 650, desc: "Refines fuel quality for a smoother, more spirited ride." },
      { name: "Engine Degreaser", price: 650, desc: "Strips grease and grime from the engine bay with ease." }
    ]
  },
  {
    key: "exterior",
    title: "Exterior Grandeur",
    tagline: "The finishing touches that turn a car into a statement.",
    products: [
      { name: "Foam Cleaner", price: 500, desc: "A thick, clinging foam that lifts dirt before it's wiped." },
      { name: "Tire Foam", price: 500, desc: "Restores tyres to a deep, satin-black richness." },
      { name: "Tire Shiner", price: 650, desc: "A glossy tyre dressing that holds its shine for weeks." },
      { name: "Wash and Wax (500ml)", price: 500, desc: "Washes and waxes in one pass for a quick, glossy finish." },
      { name: "Car Shampoo", price: 500, desc: "A gentle, foaming shampoo that's kind to paint and clear coat." },
      { name: "Color Magic Grey", price: 850, desc: "A tinted restorer that revives faded grey paintwork." },
      { name: "Color Magic Black", price: 850, desc: "A tinted restorer that deepens and revives black paintwork." }
    ]
  },
  {
    key: "interior",
    title: "Interior Elegance",
    tagline: "Comfort and craftsmanship, cared for from the inside out.",
    products: [
      { name: "Leather Cleaner", price: 650, desc: "Lifts dirt from leather while keeping it supple and soft." },
      { name: "Dashboard Spray", price: 400, desc: "Leaves dashboards with a clean, matte-fresh, non-greasy finish." }
    ]
  }
];

let idCounter = 1;
rawCategories.forEach(cat => cat.products.forEach(p => { p.id = idCounter++; }));

module.exports = { categories: rawCategories };
