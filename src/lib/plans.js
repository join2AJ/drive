// Plans, hardware and pricing for personal owners and businesses (taxis, fleets).
// Prices are in ₹ before 18% GST. Yearly billing = 10 × monthly (2 months free).

export const GST = 0.18;

export const VEHICLE_TYPES = {
  car: { label: 'Car', device: 'tracker' },
  bike: { label: 'Bike / scooter', device: 'bike' },
  auto: { label: 'Auto-rickshaw', device: 'bike' },
  taxi: { label: 'Taxi / cab', device: 'cam' },
  bus: { label: 'Bus', device: 'cam' },
  truck: { label: 'Truck', device: 'tracker' },
};

export const PLANS = {
  free: {
    audience: 'personal', name: 'Free', monthly: 0, vehicles: [1, 1],
    tagline: 'Know where your vehicle is',
    features: ['Live location & today’s trips', '7-day trip history', 'Ignition, overspeed & power-cut alerts', '1 geofence'],
  },
  plus: {
    audience: 'personal', name: 'Plus', monthly: 99, vehicles: [1, 1], popular: true,
    tagline: 'Everything for one car or bike',
    features: ['1-year trip history', 'Crash detection with SOS', 'Unlimited geofences & route-deviation alarm', 'Stops & activity reports', 'Fuel, toll & parking costs', 'Reminders, fuel log, logbook export', 'Stolen-vehicle mode'],
  },
  family: {
    audience: 'personal', name: 'Family', monthly: 199, vehicles: [2, 3],
    tagline: 'Up to 3 vehicles and every driver',
    features: ['Everything in Plus, for 3 vehicles', 'Driver profiles & new-driver mode', 'Share my ride', 'AI assistant & statement drafts', 'Incident claims with 30 GB evidence storage'],
  },
  fleet: {
    audience: 'business', name: 'Fleet', monthly: 149, perVehicle: true, vehicles: [2, 999],
    tagline: 'Taxis, autos, delivery and small fleets',
    features: ['Live fleet map & vehicle states', 'Trips, stops & idling reports', 'Geofences & route-deviation alarms', 'Driver scores & weekly reports', 'Fuel, toll & parking costs per vehicle', 'Excel / PDF exports', '3 admin users'],
  },
  pro: {
    audience: 'business', name: 'Fleet Pro', monthly: 249, perVehicle: true, vehicles: [2, 9999], popular: true,
    tagline: 'Buses, trucks and growing operators',
    features: ['Everything in Fleet', 'Assigned routes & dispatch', 'Dashcam cloud storage (30 days)', 'AI assistant for managers', 'API & webhooks', 'Unlimited admins, roles & SSO', 'Priority support'],
  },
  enterprise: {
    audience: 'business', name: 'Enterprise', monthly: null, perVehicle: true, vehicles: [1000, Infinity],
    tagline: '1,000+ vehicles, custom terms',
    features: ['AIS-140 certified devices', 'Private cloud or on-premise', '99.9% uptime SLA', 'White-label app', 'Dedicated success manager'],
  },
};

export const HARDWARE = {
  none: { name: 'I have a compatible device', buy: 0, rent: 0 },
  tracker: { name: 'Drive Tracker (wired 4G)', buy: 3999, rent: 149, for: 'Cars, trucks' },
  bike: { name: 'Drive Bike (IP67, compact)', buy: 2499, rent: 99, for: 'Bikes, scooters, autos' },
  cam: { name: 'Drive Cam (4G + dual dashcam)', buy: 8999, rent: 349, for: 'Taxis, buses' },
};
export const INSTALL_FEE = 499; // per vehicle; free from 10 vehicles

/** Volume discount on business plans. */
export function volumeDiscount(n) {
  if (n >= 200) return 0.15;
  if (n >= 50) return 0.1;
  return 0;
}

/**
 * Quote for a plan: upfront (hardware + install) and recurring (subscription + rent), with GST.
 * billing: 'monthly' | 'yearly'; hw: HARDWARE key; hwMode: 'buy' | 'rent'.
 */
export function quote({ plan, vehicles = 1, billing = 'monthly', hw = 'tracker', hwMode = 'buy' }) {
  const p = PLANS[plan];
  if (!p || p.monthly == null) return null;
  const n = Math.max(p.vehicles[0], Math.min(vehicles, p.vehicles[1]));
  const disc = p.perVehicle ? volumeDiscount(n) : 0;
  const subMonthly = (p.perVehicle ? p.monthly * n : p.monthly) * (1 - disc);
  const h = HARDWARE[hw] ?? HARDWARE.none;
  const units = p.perVehicle ? n : Math.min(n, p.vehicles[1]);
  const rentMonthly = hwMode === 'rent' ? h.rent * units : 0;
  const install = hw === 'none' ? 0 : (units >= 10 ? 0 : INSTALL_FEE * units);
  const upfront = (hwMode === 'buy' ? h.buy * units : 0) + install;
  const recurringMonthly = subMonthly + rentMonthly;
  const period = billing === 'yearly' ? recurringMonthly * 10 : recurringMonthly;
  return {
    vehicles: n,
    discount: disc,
    subMonthly,
    rentMonthly,
    upfront,
    install,
    period,
    periodLabel: billing === 'yearly' ? 'per year' : 'per month',
    perVehicleMonthly: n ? recurringMonthly / n : 0,
    gst: (upfront + period) * GST,
    firstBill: (upfront + period) * (1 + GST),
    yearlySaving: billing === 'yearly' ? recurringMonthly * 2 : 0,
  };
}
