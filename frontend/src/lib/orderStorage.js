/**
 * Custom orders, persisted in localStorage.
 *
 * Deliberately local for now: an order is a list of ids and a name, and until
 * there are accounts there is nothing a server round trip would add. The shape
 * mirrors the `custom_orders` / `custom_order_items` tables that already exist
 * in the backend, so adopting accounts later is a change of transport rather
 * than a change of model.
 */

const STORAGE_KEY = 'mcu.custom-orders.v1'

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt or unavailable storage should degrade to "no saved orders"
    // rather than taking the page down.
    return []
  }
}

function writeAll(orders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
}

export function listOrders() {
  return readAll().sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
}

export function getOrder(id) {
  return readAll().find((order) => order.id === id) ?? null
}

export function saveOrder({ id, name, movie_ids }) {
  const orders = readAll()
  const now = new Date().toISOString()
  const existing = orders.findIndex((order) => order.id === id)

  const record = {
    id: id ?? crypto.randomUUID(),
    name: name?.trim() || 'Untitled order',
    movie_ids,
    created_at: existing >= 0 ? orders[existing].created_at : now,
    updated_at: now,
  }

  if (existing >= 0) orders[existing] = record
  else orders.push(record)

  writeAll(orders)
  return record
}

export function deleteOrder(id) {
  writeAll(readAll().filter((order) => order.id !== id))
}
