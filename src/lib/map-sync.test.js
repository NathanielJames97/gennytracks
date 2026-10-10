import { expect, test, vi } from 'vitest';
import { syncMapView } from './map-sync';
test('bounds-clamped reciprocal move events cannot recurse', () => {
  const lock = {};
  const left = { getCenter: () => ({ lat: 51.5, lng: -.1 }), getZoom: () => 8, setView: vi.fn() };
  const right = { getCenter: () => ({ lat: 52, lng: 0 }), getZoom: () => 7,
    setView: vi.fn(() => syncMapView(right, left, lock)) };
  syncMapView(left, right, lock);
  expect(right.setView).toHaveBeenCalledTimes(1);
  expect(left.setView).not.toHaveBeenCalled();
  expect(lock.syncing).toBe(false);
});
test('identical views need no movement and thrown updates release the lock', () => {
  const source = { getCenter: () => ({ lat: 51, lng: 0 }), getZoom: () => 7 };
  const target = { ...source, setView: vi.fn() };
  const lock = {};
  syncMapView(source, target, lock);
  expect(target.setView).not.toHaveBeenCalled();
  target.getZoom = () => 8;
  target.setView = () => { throw new Error('map removed'); };
  expect(() => syncMapView(source, target, lock)).toThrow('map removed');
  expect(lock.syncing).toBe(false);
});
