/**
 * The closing branch of an exhaustive `switch` over a union: a case the switch
 * forgot leaves the value assignable to something other than `never`, and the
 * type check names it here.
 *
 * It checks at compile time only. A union read off the wire can grow on a
 * newer server before this client has the case, and the contract for an
 * unknown value is to ignore it (Sync-API §7), so nothing is thrown.
 */
export function assertNever(value: never): void {
  void value
}
