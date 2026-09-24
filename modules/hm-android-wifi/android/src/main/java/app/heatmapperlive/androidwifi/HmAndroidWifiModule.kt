package app.heatmapperlive.androidwifi

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.SupplicantState
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Polls the connected access point's WifiInfo and reports every poll as-is.
 * It never invents timestamps or values: the JS adapter decides which polls
 * carry a genuinely new radio measurement. No scans, no background work.
 */
class HmAndroidWifiModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var intervalMs = 1000L
  private var running = false

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw IllegalStateException("React context unavailable")

  private val wifiManager: WifiManager
    get() = context.getSystemService(Context.WIFI_SERVICE) as WifiManager

  private val poll = object : Runnable {
    override fun run() {
      if (!running) return
      try {
        sendEvent("onPoll", snapshot())
      } catch (error: Exception) {
        sendEvent("onError", mapOf("message" to (error.message ?: error.toString())))
      }
      handler.postDelayed(this, intervalMs)
    }
  }

  @Suppress("DEPRECATION") // connectionInfo is still the only synchronous connected-AP read for a foreground app.
  private fun snapshot(): Map<String, Any?> {
    val info: WifiInfo? = wifiManager.connectionInfo
    val connected = isConnected(info)
    return mapOf(
      "polledAtMs" to System.currentTimeMillis(),
      "connected" to connected,
      "rssiDbm" to info?.rssi,
      "bssid" to info?.bssid,
      "ssid" to info?.ssid,
      "frequencyMhz" to info?.frequency?.takeIf { it > 0 },
      "linkSpeedMbps" to info?.linkSpeed?.takeIf { it > 0 },
      "rxLinkSpeedMbps" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) info?.rxLinkSpeedMbps?.takeIf { it > 0 } else null,
      "txLinkSpeedMbps" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) info?.txLinkSpeedMbps?.takeIf { it > 0 } else null,
    )
  }

  /** Associated with an access point and reporting a real RSSI (-127 is WifiInfo's "invalid"). */
  private fun isConnected(info: WifiInfo?): Boolean =
    info != null && info.supplicantState == SupplicantState.COMPLETED && info.rssi > -127 && info.rssi < 0

  private fun stopPolling() {
    running = false
    handler.removeCallbacks(poll)
  }

  override fun definition() = ModuleDefinition {
    Name("HmAndroidWifi")

    Events("onPoll", "onError")

    AsyncFunction("getStatus") {
      @Suppress("DEPRECATION")
      val info = wifiManager.connectionInfo
      mapOf(
        "wifiEnabled" to wifiManager.isWifiEnabled,
        "connected" to (isConnected(info)),
        "hasLocationPermission" to (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED),
        "apiLevel" to Build.VERSION.SDK_INT,
        "deviceModel" to "${Build.MANUFACTURER} ${Build.MODEL}",
      )
    }

    Function("start") { requestedIntervalMs: Int ->
      intervalMs = requestedIntervalMs.coerceIn(250, 10_000).toLong()
      stopPolling()
      running = true
      handler.post(poll)
    }

    Function("stop") {
      stopPolling()
    }

    OnDestroy {
      stopPolling()
    }
  }
}
