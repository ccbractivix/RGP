'use strict';
const { VALID_VILLAS } = require('../shared/rooms');
const CAPACITY = 53;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RequestError(400, 'Choose a Thursday show date.');
  }
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCDay() !== 4) {
    throw new RequestError(400, 'Choose a valid Thursday show date.');
  }
  return value;
}

function reservationInput(body) {
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
    throw new RequestError(400, 'Enter a first and last name (100 characters maximum each).');
  }
  if (!VALID_VILLAS.has(body.villa)) throw new RequestError(400, 'Select a valid room and unit.');
  if (!Number.isInteger(body.seats) || body.seats < 1 || body.seats > 2147483647) {
    throw new RequestError(400, 'Seats requested must be a positive whole number.');
  }
  return { firstName, lastName, villa: body.villa, seats: body.seats };
}

function scoreboard(rows) {
  const reserved = rows.reduce((sum, row) => sum + row.seats, 0);
  const checkedIn = rows.reduce((sum, row) => sum + row.checked_in, 0);
  return {
    capacity: CAPACITY, reserved, checkedIn,
    available: Math.max(0, CAPACITY - reserved),
    oversold: Math.max(0, reserved - CAPACITY),
    remaining: Math.max(0, CAPACITY - checkedIn),
    overCapacity: Math.max(0, checkedIn - CAPACITY),
    awaiting: reserved - checkedIn,
  };
}

function checkInInput(body, row, total) {
  if (!Number.isInteger(body.delta) || body.delta === 0) {
    throw new RequestError(400, 'Enter a nonzero whole number of arrivals or corrections.');
  }
  const next = row.checked_in + body.delta;
  if (next < 0 || next > row.seats) {
    throw new RequestError(400, 'Check-in must stay between zero and the seats reserved.');
  }
  if (body.delta > 0 && total + body.delta > CAPACITY && body.override !== true) {
    throw new RequestError(409, 'capacity_override_required');
  }
  return next;
}

module.exports = { CAPACITY, RequestError, validateDate, reservationInput, scoreboard, checkInInput };
