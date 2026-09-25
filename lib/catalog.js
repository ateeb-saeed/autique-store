// The Autique catalogue: categories by need, product types, and every product
// with its price, SKU, variants, details and photos. Applied to a store with
// admin → Products → "Import Autique catalogue" (see applyCatalog in server.js).
//
// Prices come from Autique's price list. Sizes and model codes come from the
// brands' own listings (Gladiator: gt-carcare.com; Prato: Guangzhou Flamingo
// Car Care Tech's catalogue; Sogo / WTB: Pakistani retailer listings).
// Photos are in public/products/.

// Shop by need: these are the store's categories
const NEEDS = [
  { key: 'cleaning', title: 'Cleaning', tagline: 'Shampoos, foams and degreasers that lift dirt from paint, tyres, glass, interiors and engines.' },
  { key: 'shining', title: 'Shine & Protect', tagline: 'Tyre gels, waxes and dressings for a deep, lasting shine that guards against sun and weather.' },
  { key: 'polishing', title: 'Polishing & Restoration', tagline: 'Compounds and colour polishes that remove light scratches and bring faded paint back.' },
  { key: 'protection', title: 'Protection & Maintenance', tagline: 'Anti-rust lubricants and care that keeps metal parts moving freely.' },
  { key: 'engine', title: 'Engine & Fuel Care', tagline: 'Injector cleaners, octane boosters and flushes for a smoother, stronger engine.' }
];

// Shop by type
const TYPES = [
  { key: 'tyre-care', title: 'Tyre Care' },
  { key: 'car-wash', title: 'Car Wash & Shampoo' },
  { key: 'interior', title: 'Interior Care' },
  { key: 'leather', title: 'Leather Care' },
  { key: 'glass', title: 'Glass Care' },
  { key: 'wax-polish', title: 'Wax & Polish' },
  { key: 'paint-care', title: 'Scratch & Paint Care' },
  { key: 'engine-care', title: 'Engine Care' },
  { key: 'fuel-additives', title: 'Fuel Additives' },
  { key: 'rust', title: 'Rust & Lubricants' },
  { key: 'fragrances', title: 'Car Fragrances' }
];

const img = file => `/products/${file}.webp`;

// match: names these products had in the original catalogue, so an existing
// store updates them in place (keeping ids, stock and order history).
const PRODUCTS = [
  // ---------------- Gladiator ----------------
  {
    match: ['Gladiator Tire Gel'], name: 'Gladiator Tire Gel', brand: 'Gladiator', size: '450 ml',
    sku: 'GLD-GT35W-450', price: 650, need: 'shining', type: 'tyre-care', images: [img('gladiator-tire-gel-gt35w')],
    desc: 'A water-resistant polymer gel that gives tyres a rich, long-lasting black gloss and helps protect the rubber from cracking, ageing and fading in the sun.',
    usage: '- Clean and dry the tyre first\n- Shake well\n- Put a little gel on a foam applicator and spread it evenly over the tyre wall\n- Let it dry before driving',
    specs: 'Model: GT35W\nVolume: 450 ml\nFinish: High gloss\nSuitable for: Car, SUV and motorcycle tyres'
  },
  {
    match: ['Gladiator Premium Hard Wax'], name: 'Gladiator Platinum Hard Wax', brand: 'Gladiator', size: '200 g',
    sku: 'GLD-GT60-200', price: 800, need: 'shining', type: 'wax-polish', images: [img('gladiator-hard-wax-gt60')],
    desc: 'A carnauba-based paste wax blended with polymers that leaves a deep, mirror-like shine and a protective layer against UV, acid rain and road grime.',
    usage: '- Wash and dry the car, and work in the shade\n- Apply a thin layer with the applicator in small circles, one panel at a time\n- Let it haze\n- Buff off with a clean, soft microfiber cloth',
    specs: 'Model: GT60\nWeight: 200 g\nType: Carnauba hard (paste) wax\nApplicator: Included'
  },
  {
    match: ['Gladiator Tire Foam'], name: 'Gladiator Tire Foam', brand: 'Gladiator', size: '650 ml',
    sku: 'GLD-GT03S-650', price: 500, need: 'cleaning', type: 'tyre-care', images: [img('gladiator-tire-foam-gt03s')],
    desc: 'A one-step foaming tyre cleaner that dissolves dirt and grime and dries to a rich satin finish, with no wiping or buffing.',
    usage: '- Shake well\n- Spray evenly on the tyre wall from about 15 cm\n- Leave it to work and dry: no wiping needed\n- Keep off brake parts; rinse any overspray from the driveway',
    specs: 'Model: GT03S\nVolume: 650 ml (aerosol)\nFinish: Satin\nWorks on: Wet or dry tyres'
  },
  {
    match: ['Gladiator Windshield Washer'], name: 'Gladiator Windshield Washer', brand: 'Gladiator', size: '450 ml',
    sku: 'GLD-GT32-450', price: 500, need: 'cleaning', type: 'glass', images: [img('gladiator-windshield-washer-gt32')],
    desc: 'A super-concentrated washer fluid that clears road film, grease and rain spots, leaves a protective film on the glass and helps wiper blades glide smoothly.',
    usage: '- Pour one bottle into the washer tank\n- Top up with about 6 litres of water',
    specs: 'Model: GT32\nVolume: 450 ml concentrate\nMakes: About 6 litres of washer fluid'
  },
  {
    match: ['Gladiator Compound'], name: 'Gladiator Rubbing Compound', brand: 'Gladiator', size: '',
    sku: 'GLD-GT50', price: 600, need: 'polishing', type: 'paint-care', images: [img('gladiator-rubbing-compound-gt50')],
    desc: 'A cutting compound that removes light scratches, swirl marks and oxidation. The abrasives break down as you work for a smooth finish with little splatter or dust.',
    usage: '- Work on a clean, cool panel\n- Shake well\n- By hand or machine (1,500 to 2,000 RPM), work a small amount into one section at a time\n- Mist with water when machine polishing to reduce heat\n- Wipe off and follow with wax',
    specs: 'Model: GT50\nUse: By hand or rotary polisher\nRemoves: Light scratches, swirls, oxidation'
  },
  {
    match: ['Gladiator Leather Wax'], name: 'Gladiator Leather & Tyre Wax', brand: 'Gladiator', size: '500 ml',
    sku: 'GLD-LTW-500', price: 650, need: 'shining', type: 'leather', images: [img('gladiator-leather-tyre-wax')],
    desc: 'A trigger-spray wax that conditions leather seats and trim to a soft, like-new sheen, and gives tyres a protected, glossy look.',
    usage: '- Shake well\n- Spray a little onto a clean surface or cloth\n- Work it in with small circles\n- Buff with a clean microfiber cloth',
    specs: 'Volume: 500 ml (trigger spray)\nFor: Leather seats, trim and tyres'
  },
  // ---------------- Sogo ----------------
  {
    match: ['Sogo Multipurpose Cleaner'], name: 'Sogo Multi-Purpose Foam Cleaner', brand: 'Sogo', size: '650 ml',
    sku: 'SOGO-MPFC-650', price: 500, need: 'cleaning', type: 'interior', images: [img('sogo-multi-purpose-foam-cleaner')],
    desc: 'A deep-cleaning foam for car interiors. It lifts dirt from fabric and vinyl upholstery, carpets, floor mats, leather and seats, and brings back their true colour.',
    usage: '- Shake well and spray onto the surface\n- Leave for 30 to 40 seconds\n- Scrub lightly with a damp cloth, sponge or brush if needed\n- Wipe clean with a dry cloth',
    specs: 'Volume: 650 ml (aerosol)\nFor: Fabric, carpet, vinyl, leather\nUse: Car interiors'
  },
  {
    match: ['Sogo Tire Foam'], name: 'Sogo Tire Foam Cleaner', brand: 'Sogo', size: '650 ml',
    sku: 'SOGO-SG02F-650', price: 500, need: 'cleaning', type: 'tyre-care', images: [img('sogo-tire-foam-sg02f')],
    desc: 'Spray it on and walk away: a foaming tyre cleaner that dissolves road grime and leaves a deep black shine that lasts for weeks.',
    usage: '- Shake well\n- Spray evenly on the tyre wall from about 15 cm\n- No wiping or buffing needed',
    specs: 'Model: SG-02F\nVolume: 650 ml (aerosol)\nSafe on: All wheel surfaces'
  },
  {
    match: ['Sogo Antirust (100ml)'], name: 'Sogo Anti-Rust Lubricant', brand: 'Sogo', size: '100 ml',
    sku: 'SOGO-AR-100', price: 250, need: 'protection', type: 'rust', images: [],
    desc: 'A penetrating anti-rust spray that loosens stuck and rusted parts, drives out moisture and leaves a light protective film that guards against corrosion.',
    usage: '- Shake well\n- Spray onto the part and leave a few minutes to penetrate\n- Work the part loose, then wipe off the excess',
    specs: 'Volume: 100 ml\nFor: Nuts, bolts, hinges, locks and tools'
  },
  // ---------------- Prato ----------------
  {
    match: ['Prato Petrol Injector Cleaner'], name: 'Prato Petrol Injector Cleaner', brand: 'Prato', size: '354 ml',
    sku: 'PRT-P053-354', price: 500, need: 'engine', type: 'fuel-additives', images: [img('prato-petrol-injector-cleaner-p053')],
    desc: 'A fuel-tank treatment that cleans petrol injectors and the fuel system, smoothing out rough idle and restoring lost power and acceleration.',
    usage: '- Pour the whole bottle into a full tank of petrol\n- One bottle treats 60 to 80 litres\n- Use every 3,000 km for best results',
    specs: 'Model: P053\nVolume: 354 ml\nFuel: Petrol\nTreats: 60 to 80 litres'
  },
  {
    match: ['Diesel Injector Cleaner'], name: 'Prato Diesel Injector Cleaner', brand: 'Prato', size: '',
    sku: 'PRT-DIC', price: 500, need: 'engine', type: 'fuel-additives', images: [],
    desc: 'A fuel-tank treatment for diesel engines that cleans injectors and the fuel system to restore power, response and smoother running.',
    usage: '- Pour into the diesel tank before filling up\n- Use at every service, or every 3,000 km',
    specs: 'Fuel: Diesel'
  },
  {
    match: ['Octane Booster'], name: 'Prato Octane Booster', brand: 'Prato', size: '300 ml',
    sku: 'PRT-P145-300', price: 500, need: 'engine', type: 'fuel-additives', images: [img('prato-octane-booster-p145')],
    desc: 'Raises the octane of your petrol to reduce knocking and pinging and give a smoother, more responsive drive. Comes with a pouring spout.',
    usage: '- Add the whole bottle to a full tank of petrol\n- One bottle treats 60 to 80 litres\n- Use every 3,000 km for best results',
    specs: 'Model: P145\nVolume: 300 ml\nFuel: Petrol\nTreats: 60 to 80 litres'
  },
  {
    match: ['Foam Cleaner'], name: 'Prato Foam Cleaner', brand: 'Prato', size: '650 ml',
    sku: 'PRT-P002-650', price: 500, need: 'cleaning', type: 'interior', images: [img('prato-foam-cleaner-p002')],
    desc: 'A neutral-pH, multi-purpose foam that deep-cleans upholstery, carpets, mats, vinyl and leather, and works on painted surfaces too.',
    usage: '- Shake well and spray onto the surface\n- Let the foam work for a moment\n- Wipe clean with a soft cloth; repeat on heavy dirt',
    specs: 'Model: P002\nVolume: 650 ml (aerosol)\nFormula: Neutral pH\nFor: Interior and exterior'
  },
  {
    match: ['Tire Foam'], name: 'Prato Tire Foam', brand: 'Prato', size: '650 ml',
    sku: 'PRT-P003-650', price: 500, need: 'cleaning', type: 'tyre-care', images: [img('prato-tire-foam-p003')],
    desc: 'A foaming cleaner and shine for tyres that lifts dirt and leaves a deep black finish.',
    usage: '- Shake well\n- Spray evenly on the tyre wall\n- Leave it to dry; wipe with a soft cloth on heavy dirt and repeat if needed',
    specs: 'Model: P003\nVolume: 650 ml (aerosol)'
  },
  {
    match: ['Tire Shiner'], name: 'Prato Tire Shine', brand: 'Prato', size: '500 ml',
    sku: 'PRT-P010-500', price: 650, need: 'shining', type: 'tyre-care', images: [img('prato-tire-shine-p010')],
    desc: 'A high-silicone tyre spray that gives a wet-look shine in seconds and protects the rubber, with no wiping.',
    usage: '- Shake the can well\n- Hold 20 to 30 cm away and spray evenly on a clean, dry tyre\n- Let it dry for at least 5 minutes; do not wipe',
    specs: 'Model: P010\nVolume: 500 ml (aerosol)\nFinish: Wet look'
  },
  {
    match: ['Leather Cleaner'], name: 'Prato Leather Polish', brand: 'Prato', size: '500 ml',
    sku: 'PRT-P029-500', price: 650, need: 'cleaning', type: 'leather', images: [img('prato-leather-polish-p029')],
    desc: 'Cleans and protects leather seats, cockpit trim and upholstery, leaving a soft, protective shine.',
    usage: '- Clean the surface first\n- Apply with a clean cloth or sponge and spread evenly\n- Leave a few minutes to penetrate, then wipe off the excess',
    specs: 'Model: P029\nVolume: 500 ml (trigger spray)\nFor: Leather seats, dashboards, trim'
  },
  {
    match: ['Engine Degreaser'], name: 'Prato Engine Degreaser', brand: 'Prato', size: '650 ml',
    sku: 'PRT-P008-650', price: 650, need: 'cleaning', type: 'engine-care', images: [img('prato-engine-degreaser-p008')],
    desc: 'A foaming engine degreaser that breaks down oil, grease and dirt on the engine surface. Safe on rubber, plastic and paint.',
    usage: '- Run the engine for about 5 minutes, then switch off\n- Cover the air intake and electrical parts\n- Shake well and spray over the engine surface\n- Rinse with clean water after 5 minutes',
    specs: 'Model: P008\nVolume: 650 ml (aerosol)\nType: Foaming'
  },
  {
    match: ['Wash and Wax (500ml)'], name: 'Prato Wash & Wax', brand: 'Prato', size: '500 ml',
    sku: 'PRT-WW-500', price: 500, need: 'cleaning', type: 'car-wash', images: [],
    desc: 'Washes and waxes in one step: lifts dirt safely and leaves a glossy, water-beading finish.',
    usage: '- Dilute in a bucket of water\n- Wash one section at a time with a mitt or sponge, in the shade\n- Rinse and dry with a microfiber towel',
    specs: 'Volume: 500 ml'
  },
  {
    match: ['Car Shampoo'], name: 'Prato Car Wash Shampoo', brand: 'Prato', size: '',
    sku: 'PRT-P332', price: 500, need: 'cleaning', type: 'car-wash', images: [img('prato-car-wash-shampoo-p332')],
    desc: 'A rich-foaming car shampoo that gently lifts away dirt that causes scratches and swirls, and leaves a clean, glossy finish.',
    usage: '- Rinse the car to remove loose dirt\n- Mix the shampoo into a bucket of water\n- Wash with a mitt or sponge in the shade, then rinse\n- Dry straight away with a soft towel',
    specs: 'Model: P332'
  },
  {
    match: ['Dashboard Spray'], name: 'Prato Dashboard Polish', brand: 'Prato', size: '220 ml',
    sku: 'PRT-P024-220', price: 400, need: 'shining', type: 'interior', images: [img('prato-dashboard-polish-strawberry')],
    desc: 'A silicone dashboard spray that cleans, shines and protects the dashboard, trim and leather, leaving a fresh fragrance. Choose your scent.',
    usage: '- Spray from about 20 cm onto the surface\n- Wipe evenly with a soft cloth',
    specs: 'Model: P024\nVolume: 220 ml (aerosol)\nFor: Dashboards, trim, leather, rubber',
    variants: [
      { size: 'Strawberry', sku: 'PRT-P024S-220', image: img('prato-dashboard-polish-strawberry') },
      { size: 'Apple', sku: 'PRT-P024A-220', image: img('prato-dashboard-polish-apple') },
      { size: 'Jasmine', sku: 'PRT-P024J-220', image: img('prato-dashboard-polish-jasmine') },
      { size: 'Lemon', sku: 'PRT-P024L-220', image: img('prato-dashboard-polish-lemon') },
      { size: 'Peach', sku: 'PRT-P024P-220', image: img('prato-dashboard-polish-peach') }
    ]
  },
  {
    match: ['Motor Flush'], name: 'Prato Motor Flush', brand: 'Prato', size: '443 ml',
    sku: 'PRT-P048-443', price: 500, need: 'engine', type: 'engine-care', images: [img('prato-motor-flush-p048')],
    desc: 'An engine flush used before an oil change. It loosens sludge, gum and carbon deposits so they drain out with the old oil, helping restore power and smooth running.',
    usage: '- Warm the engine up, then switch off\n- Add the flush to the engine oil\n- Idle for 5 to 10 minutes (do not drive)\n- Drain the oil, change the filter and refill with new oil',
    specs: 'Model: P048\nVolume: 443 ml\nUse: Before every oil change'
  },
  // ---------------- Color Magic ----------------
  {
    match: ['Color Magic Grey', 'Color Magic Black'], name: 'Color Magic Colour Polish', brand: '', size: '',
    sku: 'CM', price: 850, need: 'polishing', type: 'paint-care', images: [],
    desc: 'A colour-enriched polish that cleans, adds colour depth and hides light scratches and swirl marks, for a deep, glossy finish. Choose the colour closest to your car.',
    usage: '- Wash and dry the car; work on a cool panel in the shade\n- Shake well and test on a small hidden area\n- Apply with a damp applicator, one section at a time\n- Let it haze, then buff with a soft cloth',
    specs: 'For: Grey / silver or black paint',
    variants: [
      { color: 'Grey', sku: 'CM-GRY' },
      { color: 'Black', sku: 'CM-BLK' }
    ]
  },
  // ---------------- WTB ----------------
  {
    match: ['WTB Fuel Injector Cleaner'], name: 'WTB Fuel Injector Cleaner', brand: 'WTB', size: '450 ml',
    sku: 'WTB-FIC-450', price: 650, need: 'engine', type: 'fuel-additives', images: [],
    desc: 'A premium fuel injector cleaner that removes harmful deposits from injectors to restore engine responsiveness and efficiency.',
    usage: '- Add to the fuel tank before filling up\n- Use every 3,000 to 5,000 km',
    specs: 'Volume: 450 ml'
  },
  {
    match: ['WTB Octane Booster'], name: 'WTB Octane Booster', brand: 'WTB', size: '355 ml',
    sku: 'WTB-OB-355', price: 650, need: 'engine', type: 'fuel-additives', images: [img('wtb-octane-booster')],
    desc: 'An octane booster with cleaning detergents and friction modifiers that raises fuel quality, reduces knocking and helps prevent deposits.',
    usage: '- Add the bottle to the fuel tank before filling up\n- Use every fill-up or as needed',
    specs: 'Volume: 355 ml\nFuel: Petrol'
  }
];

module.exports = { NEEDS, TYPES, PRODUCTS };
