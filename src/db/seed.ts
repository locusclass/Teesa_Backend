import { PrismaClient, UserRole, AccountStatus, DriverStatus, VehicleStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const categories = [
  { slug: 'boda-boda',     name: 'Boda Boda',            type: 'PASSENGER' as const, sortOrder: 1 },
  { slug: 'tuk-tuk',       name: 'Tuk Tuk / Bajaj',      type: 'PASSENGER' as const, sortOrder: 2 },
  { slug: 'cargo-tuk-tuk', name: 'Cargo Tuk Tuk',        type: 'CARGO'     as const, sortOrder: 3 },
  { slug: 'standard-car',  name: 'Standard Car',          type: 'PASSENGER' as const, sortOrder: 4 },
  { slug: 'executive-car', name: 'Executive Car',         type: 'PASSENGER' as const, sortOrder: 5 },
  { slug: 'vip-luxury',    name: 'VIP / Luxury Car',      type: 'PASSENGER' as const, sortOrder: 6 },
  { slug: 'van-shuttle',   name: 'Van / Shuttle',         type: 'PASSENGER' as const, sortOrder: 7 },
  { slug: 'minibus-taxi',  name: 'Minibus / Taxi',        type: 'PASSENGER' as const, sortOrder: 8 },
  { slug: 'coach-bus',     name: 'Coach Bus / Bus Hire',  type: 'PASSENGER' as const, sortOrder: 9 },
  { slug: 'small-cargo',   name: 'Small Cargo',           type: 'CARGO'     as const, sortOrder: 10,
    description: 'Small (Townace), Medium (Canter), Heavy Duty (Sino Truck). Negotiated pricing.' },
]

const pricingRules: Record<string, {
  baseFare: number; perKmRate: number; perMinuteRate: number;
  minimumFare: number; platformCommission: number; vipMultiplier?: number
}> = {
  'boda-boda':    { baseFare: 2000,  perKmRate: 500,  perMinuteRate: 50,  minimumFare: 2000,  platformCommission: 0.10 },
  'tuk-tuk':      { baseFare: 3000,  perKmRate: 700,  perMinuteRate: 60,  minimumFare: 3000,  platformCommission: 0.12 },
  'cargo-tuk-tuk':{ baseFare: 5000,  perKmRate: 800,  perMinuteRate: 70,  minimumFare: 5000,  platformCommission: 0.12 },
  'standard-car': { baseFare: 5000,  perKmRate: 1200, perMinuteRate: 100, minimumFare: 5000,  platformCommission: 0.15 },
  'executive-car':{ baseFare: 10000, perKmRate: 2000, perMinuteRate: 150, minimumFare: 10000, platformCommission: 0.15 },
  'vip-luxury':   { baseFare: 20000, perKmRate: 3500, perMinuteRate: 200, minimumFare: 20000, platformCommission: 0.15, vipMultiplier: 1.5 },
  'van-shuttle':  { baseFare: 8000,  perKmRate: 1500, perMinuteRate: 120, minimumFare: 8000,  platformCommission: 0.15 },
  'minibus-taxi': { baseFare: 6000,  perKmRate: 1000, perMinuteRate: 80,  minimumFare: 6000,  platformCommission: 0.12 },
  'coach-bus':    { baseFare: 50000, perKmRate: 3000, perMinuteRate: 300, minimumFare: 50000, platformCommission: 0.12 },
  // Small Cargo: negotiated — base fares reflect minimum starting points per vehicle size
  'small-cargo':  { baseFare: 30000, perKmRate: 2000, perMinuteRate: 200, minimumFare: 30000, platformCommission: 0.12 },
}

async function main() {
  console.log('🌱 Seeding Teesa database...')

  // Super Admin
  const adminHash = await bcrypt.hash('Admin@Teesa2024', 12)
  const superAdmin = await prisma.user.upsert({
    where: { phone: '+256700000000' },
    update: {},
    create: {
      phone: '+256700000000',
      email: 'admin@teesa.ug',
      fullName: 'Teesa Super Admin',
      passwordHash: adminHash,
      role: UserRole.SUPER_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
    },
  })
  console.log('✅ Super admin created:', superAdmin.phone)

  // Test passenger
  const passengerHash = await bcrypt.hash('Passenger@123', 12)
  const testPassenger = await prisma.user.upsert({
    where: { phone: '+256701111111' },
    update: {},
    create: {
      phone: '+256701111111',
      email: 'passenger@teesa.ug',
      fullName: 'Test Passenger',
      passwordHash: passengerHash,
      role: UserRole.PASSENGER,
      accountStatus: AccountStatus.ACTIVE,
    },
  })
  await prisma.wallet.upsert({
    where: { userId: testPassenger.id },
    update: {},
    create: { userId: testPassenger.id, balance: 50000, currency: 'UGX' },
  })
  console.log('✅ Test passenger created')

  // Test driver
  const driverHash = await bcrypt.hash('Driver@123', 12)
  const testDriver = await prisma.user.upsert({
    where: { phone: '+256702222222' },
    update: {},
    create: {
      phone: '+256702222222',
      email: 'driver@teesa.ug',
      fullName: 'Test Driver',
      passwordHash: driverHash,
      role: UserRole.DRIVER,
      accountStatus: AccountStatus.ACTIVE,
    },
  })
  const driverProfile = await prisma.driverProfile.upsert({
    where: { userId: testDriver.id },
    update: {},
    create: {
      userId: testDriver.id,
      nationalIdNo: 'CM900000001234',
      licenseNo: 'UG-DL-2020-001234',
      serviceAreas: ['Kampala', 'Wakiso', 'Mukono'],
      status: DriverStatus.APPROVED,
      approvedAt: new Date(),
      isOnline: false,
      currentLat: 0.3476,
      currentLng: 32.5825,
    },
  })
  await prisma.wallet.upsert({
    where: { userId: testDriver.id },
    update: {},
    create: { userId: testDriver.id, balance: 0, currency: 'UGX' },
  })
  console.log('✅ Test driver created')

  // Categories
  const createdCategories: Record<string, string> = {}
  for (const cat of categories) {
    const created = await prisma.transportCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: cat.sortOrder },
      create: cat,
    })
    createdCategories[cat.slug] = created.id
  }
  console.log('✅ Transport categories seeded:', categories.length)

  // Pricing rules
  for (const [slug, pricing] of Object.entries(pricingRules)) {
    const catId = createdCategories[slug]
    if (!catId) continue
    const existing = await prisma.pricingRule.findFirst({ where: { categoryId: catId } })
    if (!existing) {
      await prisma.pricingRule.create({
        data: { categoryId: catId, ...pricing, currency: 'UGX' },
      })
    }
  }
  console.log('✅ Pricing rules seeded')

  // Sample vehicles
  const vehicleSeeds = [
    { slug: 'boda-boda',     make: 'Bajaj',     model: 'Boxer 150',       year: 2022, plateNumber: 'UAT 001B',  color: 'Red',    seats: 1 },
    { slug: 'tuk-tuk',       make: 'Bajaj',     model: 'RE Compact',      year: 2021, plateNumber: 'UAT 002T',  color: 'Yellow', seats: 3 },
    { slug: 'cargo-tuk-tuk', make: 'Bajaj',     model: 'RE Max Cargo',    year: 2021, plateNumber: 'UAT 003CT', color: 'Blue',   cargoCapacity: 300 },
    { slug: 'standard-car',  make: 'Toyota',    model: 'Corolla',         year: 2019, plateNumber: 'UAT 004C',  color: 'White',  seats: 4 },
    { slug: 'vip-luxury',    make: 'Toyota',    model: 'Land Cruiser V8', year: 2022, plateNumber: 'UAT 005V',  color: 'Black',  seats: 7 },
    { slug: 'small-cargo',   make: 'Toyota',    model: 'Townace',         year: 2021, plateNumber: 'UAT 006SC', color: 'White',  cargoCapacity: 800,  truckType: 'Small' },
    { slug: 'small-cargo',   make: 'Isuzu',     model: 'Canter',          year: 2020, plateNumber: 'UAT 007SC', color: 'White',  cargoCapacity: 3500, truckType: 'Medium' },
    { slug: 'small-cargo',   make: 'Sinotruk',  model: 'HOWO A7',         year: 2021, plateNumber: 'UAT 008SC', color: 'White',  cargoCapacity: 25000,truckType: 'Heavy Duty' },
  ]
  for (const vs of vehicleSeeds) {
    const catId = createdCategories[vs.slug]
    if (!catId) continue
    await prisma.vehicle.upsert({
      where: { plateNumber: vs.plateNumber },
      update: {},
      create: {
        ownerId: driverProfile.id,
        driverId: driverProfile.id,
        categoryId: catId,
        make: vs.make,
        model: vs.model,
        year: vs.year,
        plateNumber: vs.plateNumber,
        color: vs.color,
        seats: vs.seats,
        cargoCapacity: vs.cargoCapacity,
        truckType: vs.truckType,
        verificationStatus: VehicleStatus.APPROVED,
      },
    })
  }
  console.log('✅ Sample vehicles seeded')

  // System settings
  const settings = [
    { key: 'platform_name', value: 'Teesa', type: 'string' },
    { key: 'platform_currency', value: 'UGX', type: 'string' },
    { key: 'max_offer_count', value: '10', type: 'number' },
    { key: 'offer_expiry_hours', value: '2', type: 'number' },
    { key: 'negotiation_deadline_hours', value: '24', type: 'number' },
    { key: 'driver_search_radius_km', value: '10', type: 'number' },
    { key: 'max_otp_attempts', value: '3', type: 'number' },
    { key: 'booking_cancellation_penalty', value: '1000', type: 'number' },
  ]
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s,
    })
  }
  console.log('✅ System settings seeded')

  console.log('\n🚀 Teesa database seed complete!')
  console.log('Super Admin: +256700000000 / admin@teesa.ug / Admin@Teesa2024')
  console.log('Test Passenger: +256701111111 / Passenger@123')
  console.log('Test Driver: +256702222222 / Driver@123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
