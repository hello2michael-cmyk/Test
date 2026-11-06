package com.tvmirror.screenshare

import java.net.Inet4Address
import java.net.NetworkInterface

object Net {
    /** The TV's address on the home network (Wi-Fi or Ethernet), or null when offline. */
    fun ip(): String? {
        var fallback: String? = null
        try {
            val ifaces = NetworkInterface.getNetworkInterfaces() ?: return null
            for (nif in ifaces) {
                if (!nif.isUp || nif.isLoopback) continue
                for (addr in nif.inetAddresses) {
                    if (addr is Inet4Address && !addr.isLoopbackAddress && !addr.isLinkLocalAddress) {
                        val s = addr.hostAddress ?: continue
                        val name = nif.name.lowercase()
                        if (name.startsWith("wlan") || name.startsWith("eth")) return s
                        if (fallback == null) fallback = s
                    }
                }
            }
        } catch (_: Exception) { }
        return fallback
    }
}
