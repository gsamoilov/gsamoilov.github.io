import { describe, expect, it } from 'vitest';
import {
  buildCheckAuthBody,
  buildSteamLoginUrl,
  isCheckAuthValid,
  precheckAssertion,
} from '../supabase/functions/_shared/openid';

const NOW = Date.parse('2026-11-27T15:00:00Z');
const ID = 'https://steamcommunity.com/openid/id/76561197960287930';
const ORIGINS = ['https://samoilov.org', 'http://localhost:5173'];

function assertion(over: Record<string, string> = {}) {
  return new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': ID,
    'openid.identity': ID,
    'openid.return_to': 'https://samoilov.org/auth/steam',
    'openid.response_nonce': '2026-11-27T14:59:30ZAbCdEf',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmF0dXJl',
    ...over,
  });
}

describe('buildSteamLoginUrl', () => {
  it('points at Steam with checkid_setup and our return_to', () => {
    const u = new URL(buildSteamLoginUrl('https://samoilov.org/auth/steam', 'https://samoilov.org'));
    expect(u.origin + u.pathname).toBe('https://steamcommunity.com/openid/login');
    expect(u.searchParams.get('openid.mode')).toBe('checkid_setup');
    expect(u.searchParams.get('openid.return_to')).toBe('https://samoilov.org/auth/steam');
    expect(u.searchParams.get('openid.realm')).toBe('https://samoilov.org');
  });
});

describe('precheckAssertion', () => {
  it('accepts a well-formed fresh assertion and extracts the SteamID64', () => {
    expect(precheckAssertion(assertion(), ORIGINS, NOW)).toEqual({ ok: true, steamid: '76561197960287930' });
  });

  const bad: [string, Record<string, string>][] = [
    ['cancelled login', { 'openid.mode': 'cancel' }],
    ['other provider', { 'openid.op_endpoint': 'https://evil.example/openid/login' }],
    ['non-Steam claimed id', { 'openid.claimed_id': 'https://evil.example/openid/id/76561197960287930', 'openid.identity': 'https://evil.example/openid/id/76561197960287930' }],
    ['identity != claimed_id', { 'openid.identity': 'https://steamcommunity.com/openid/id/76561197960287931' }],
    ['foreign return_to', { 'openid.return_to': 'https://evil.example/auth/steam' }],
    ['stale nonce', { 'openid.response_nonce': '2026-11-27T14:00:00Zold' }],
    ['garbage nonce', { 'openid.response_nonce': 'nope' }],
    ['claimed_id not signed', { 'openid.signed': 'signed,op_endpoint,identity,return_to,response_nonce' }],
  ];
  for (const [name, over] of bad) {
    it(`rejects: ${name}`, () => {
      expect(precheckAssertion(assertion(over), ORIGINS, NOW).ok).toBe(false);
    });
  }
});

describe('check_authentication', () => {
  it('copies every openid field and switches the mode', () => {
    const body = buildCheckAuthBody(assertion({ foo: 'bar' }));
    expect(body.get('openid.mode')).toBe('check_authentication');
    expect(body.get('openid.sig')).toBe('c2lnbmF0dXJl');
    expect(body.has('foo')).toBe(false);
  });
  it('only trusts an explicit is_valid:true', () => {
    expect(isCheckAuthValid('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')).toBe(true);
    expect(isCheckAuthValid('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n')).toBe(false);
    expect(isCheckAuthValid('<html>is_valid:true is in this page</html>')).toBe(false);
  });
});
