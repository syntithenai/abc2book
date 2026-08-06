import { isBillingAdminAvailable } from './creditAdminClient'

describe('creditAdminClient', function() {
  test('isBillingAdminAvailable requires admin and billing on the same resolver', function() {
    expect(isBillingAdminAvailable(null)).toBe(false)
    expect(isBillingAdminAvailable({ adminAccess: true })).toBe(false)
    expect(isBillingAdminAvailable({ billingEnabled: true })).toBe(false)
    expect(isBillingAdminAvailable({
      adminAccess: true,
      billingEnabled: true,
      candidates: [
        { reachable: true, available: false, adminAccess: true, billingEnabled: true, base: 'http://localhost:8787' },
      ],
    })).toBe(true)
    expect(isBillingAdminAvailable({
      billingAdminAccess: true,
      candidates: [],
    })).toBe(true)
    expect(isBillingAdminAvailable({
      billingEnabled: true,
      adminAccess: true,
      candidates: [],
    }, { email: 'syntithenai@gmail.com' })).toBe(false)
    expect(isBillingAdminAvailable({
      adminAccess: true,
      billingEnabled: true,
      candidates: [
        { reachable: true, available: true, adminAccess: true, billingEnabled: false, base: 'https://peppertrees.example.com' },
        { reachable: true, available: true, adminAccess: false, billingEnabled: true, base: 'http://localhost:8787' },
      ],
    })).toBe(false)
  })
})
