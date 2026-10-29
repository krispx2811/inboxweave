import assert from "node:assert/strict";
import { test } from "node:test";
import { isMetaMediaUrl, isPrivateOrReservedIp } from "../src/lib/net/safe-url.ts";

test("blocks private, loopback, link-local and CGNAT IPv4", () => {
  for (const ip of [
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "127.1.2.3",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "192.0.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
  ]) {
    assert.equal(isPrivateOrReservedIp(ip), true, ip);
  }
});

test("allows public IPv4", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "100.63.255.255", "100.128.0.1", "172.15.0.1", "172.32.0.1", "192.169.0.1", "93.184.216.34"]) {
    assert.equal(isPrivateOrReservedIp(ip), false, ip);
  }
});

test("blocks loopback, ULA, link-local and multicast IPv6", () => {
  for (const ip of ["::", "::1", "[::1]", "0:0:0:0:0:0:0:1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "ff02::1"]) {
    assert.equal(isPrivateOrReservedIp(ip), true, ip);
  }
});

test("blocks IPv4-mapped / NAT64 IPv6 that embed a private IPv4", () => {
  for (const ip of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "64:ff9b::10.0.0.1"]) {
    assert.equal(isPrivateOrReservedIp(ip), true, ip);
  }
});

test("allows public IPv6 and IPv4-mapped public IPv4", () => {
  for (const ip of ["2001:4860:4860::8888", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isPrivateOrReservedIp(ip), false, ip);
  }
});

test("fails closed on non-IP input", () => {
  for (const s of ["", "localhost", "example.com", "1.2.3", "256.1.1.1", "::g"]) {
    assert.equal(isPrivateOrReservedIp(s), true, s);
  }
});

test("isMetaMediaUrl accepts only https Meta CDN hosts", () => {
  for (const u of [
    "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1",
    "https://scontent.xx.fbcdn.net/v/t1/abc.ogg",
    "https://mmg.whatsapp.net/v/t62/abc",
    "https://graph.facebook.com/v21.0/123",
    "https://scontent.cdninstagram.com/x.mp4",
  ]) {
    assert.equal(isMetaMediaUrl(u), true, u);
  }
  for (const u of [
    "http://lookaside.fbsbx.com/x",
    "https://fbsbx.com.evil.com/x",
    "https://evilfbcdn.net/x",
    "https://169.254.169.254/latest/meta-data",
    "https://user:pw@lookaside.fbsbx.com/x",
    "https://lookaside.fbsbx.com:8443/x",
    "1234567890",
    "file:///etc/passwd",
  ]) {
    assert.equal(isMetaMediaUrl(u), false, u);
  }
});
