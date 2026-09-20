package com.absolutezero.usbrelaycloud

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.hoho.android.usbserial.driver.UsbSerialDriver
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import java.io.IOException
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private const val ACTION_USB_PERMISSION =
    "com.absolutezero.usbrelaycloud.USB_PERMISSION"
private const val TAG = "UsbRelay"
private const val CH340_VENDOR_ID = 0x1A86
private const val CH340_PRODUCT_ID = 0x7523
private const val PERMISSION_REQUEST_CODE = 7523
private const val PERMISSION_TIMEOUT_MS = 60_000L
private const val READ_TIMEOUT_MS = 250
private const val WRITE_TIMEOUT_MS = 4_000

@CapacitorPlugin(name = "UsbRelay")
class UsbRelayPlugin : Plugin() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val readExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val reading = AtomicBoolean(false)

    private var usbManager: UsbManager? = null
    private var port: UsbSerialPort? = null
    private var connection: UsbDeviceConnection? = null
    private var currentDeviceId: Int? = null
    private var state = "disconnected"
    private var baudRate = 9600
    private var errorCode: String? = null
    private var errorDetail: String? = null
    private var manualClose = false
    private var lastLoggedState: String? = null

    private var pendingPermissionCall: PluginCall? = null
    private var pendingPermissionDeviceId: Int? = null
    private var permissionTimeout: Runnable? = null

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != ACTION_USB_PERMISSION) {
                return
            }

            @Suppress("DEPRECATION")
            val device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                as? UsbDevice
            val granted = intent.getBooleanExtra(
                UsbManager.EXTRA_PERMISSION_GRANTED,
                false,
            )
            val call = pendingPermissionCall ?: return
            val requestedDeviceId = pendingPermissionDeviceId
            if (device != null && requestedDeviceId != device.deviceId) {
                return
            }

            clearPendingPermission()
            if (granted) {
                state = "disconnected"
                errorCode = null
                errorDetail = null
            } else {
                state = "error"
                errorCode = "USB_PERMISSION_DENIED"
                errorDetail = "用户拒绝了 USB 设备访问权限"
            }
            notifyStatus()
            call.resolve(
                JSObject()
                    .put("granted", granted)
                    .put(
                        "deviceId",
                        device?.deviceId?.toString()
                            ?: requestedDeviceId?.toString()
                            ?: "",
                    ),
            )
        }
    }

    private val usbEventReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            @Suppress("DEPRECATION")
            val device = intent?.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                as? UsbDevice
                ?: return

            when (intent.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    Log.i(
                        TAG,
                        "deviceAttached id=${device.deviceId} " +
                            "vid=${hex4(device.vendorId)} " +
                            "pid=${hex4(device.productId)}",
                    )
                    notifyListeners(
                        "deviceAttached",
                        JSObject().put(
                            "device",
                            deviceToObject(usbManager, device, null),
                        ),
                    )
                }

                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    val wasCurrent = currentDeviceId == device.deviceId
                    Log.w(
                        TAG,
                        "deviceDetached id=${device.deviceId} " +
                            "wasCurrent=$wasCurrent",
                    )
                    if (wasCurrent) {
                        closePortInternal()
                        currentDeviceId = null
                        state = "error"
                        errorCode = "SERIAL_DEVICE_DISCONNECTED"
                        errorDetail = if (
                            device.vendorId == CH340_VENDOR_ID &&
                            device.productId == CH340_PRODUCT_ID
                        ) {
                            "CH340 USB 串口设备已拔出"
                        } else {
                            "USB 串口设备已拔出"
                        }
                        notifyStatus()
                    }
                    notifyListeners(
                        "deviceDetached",
                        JSObject().put(
                            "device",
                            deviceToObject(usbManager, device, null),
                        ),
                    )
                }
            }
        }
    }

    override fun load() {
        super.load()
        usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager
        registerReceiver(
            permissionReceiver,
            IntentFilter(ACTION_USB_PERMISSION),
        )
        registerReceiver(
            usbEventReceiver,
            IntentFilter().apply {
                addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
                addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
            },
        )
    }

    @PluginMethod
    fun getDevices(call: PluginCall) {
        val manager = usbManager
            ?: return reject(call, "USB_NOT_SUPPORTED", "无法获取 UsbManager")

        val drivers = try {
            UsbSerialProber.getDefaultProber().findAllDrivers(manager)
        } catch (error: RuntimeException) {
            Log.e(TAG, "findAllDrivers failed", error)
            return reject(
                call,
                "UNKNOWN_USB_ERROR",
                error.message ?: "扫描 USB 设备失败",
            )
        }
        val driversByDeviceId = drivers.associateBy { it.device.deviceId }
        val allDevices = try {
            manager.deviceList.values.toList()
        } catch (error: RuntimeException) {
            Log.e(TAG, "UsbManager.deviceList failed", error)
            return reject(
                call,
                "UNKNOWN_USB_ERROR",
                error.message ?: "无法读取 USB 设备列表",
            )
        }
        val devices = allDevices.sortedWith(
            compareByDescending<UsbDevice> {
                driversByDeviceId.containsKey(it.deviceId)
            }.thenBy { it.deviceId },
        )

        Log.i(
            TAG,
            "getDevices: usbManager=${allDevices.size} " +
                "probedDrivers=${drivers.size}",
        )
        val result = JSArray()
        for (device in devices) {
            result.put(
                deviceToObject(
                    manager,
                    device,
                    driversByDeviceId[device.deviceId],
                ),
            )
        }
        call.resolve(JSObject().put("devices", result))
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val manager = usbManager
            ?: return reject(call, "USB_NOT_SUPPORTED", "无法获取 UsbManager")
        val requestedId = call.getString("deviceId")
        val device = if (requestedId.isNullOrBlank()) {
            preferredDevice(manager)
        } else {
            findDevice(manager, requestedId)
        } ?: return reject(
            call,
            "USB_DEVICE_NOT_FOUND",
            "未找到请求权限的 USB 设备",
        )

        if (manager.hasPermission(device)) {
            Log.i(TAG, "requestPermission: already granted id=${device.deviceId}")
            state = "disconnected"
            errorCode = null
            errorDetail = null
            notifyStatus()
            call.resolve(
                JSObject()
                    .put("granted", true)
                    .put("deviceId", device.deviceId.toString()),
            )
            return
        }

        pendingPermissionCall?.reject(
            "新的 USB 授权请求已开始",
            "USB_PERMISSION_REQUIRED",
        )
        clearPendingPermission()

        pendingPermissionCall = call
        pendingPermissionDeviceId = device.deviceId
        Log.i(TAG, "requestPermission: requesting id=${device.deviceId}")
        state = "waiting_permission"
        errorCode = "USB_PERMISSION_REQUIRED"
        errorDetail = "等待用户在 Android 系统中授权 USB 设备"
        notifyStatus()

        val permissionIntent = Intent(ACTION_USB_PERMISSION)
            .setPackage(context.packageName)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            PERMISSION_REQUEST_CODE,
            permissionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        try {
            manager.requestPermission(device, pendingIntent)
        } catch (error: SecurityException) {
            Log.e(TAG, "requestPermission failed", error)
            clearPendingPermission()
            state = "error"
            this.errorCode = "USB_PERMISSION_DENIED"
            errorDetail = error.message ?: "无法发起 USB 权限请求"
            notifyStatus()
            reject(
                call,
                "USB_PERMISSION_DENIED",
                errorDetail ?: "无法发起 USB 权限请求",
            )
            return
        }

        val timeout = Runnable {
            val timedOutCall = pendingPermissionCall ?: return@Runnable
            clearPendingPermission()
            state = "error"
            errorCode = "USB_PERMISSION_DENIED"
            errorDetail = "USB 授权请求超时"
            notifyStatus()
            reject(
                timedOutCall,
                "USB_PERMISSION_DENIED",
                "USB 授权请求超时",
            )
        }
        permissionTimeout = timeout
        mainHandler.postDelayed(timeout, PERMISSION_TIMEOUT_MS)
    }

    @PluginMethod
    fun open(call: PluginCall) {
        val manager = usbManager
            ?: return reject(call, "USB_NOT_SUPPORTED", "无法获取 UsbManager")
        val deviceId = call.getString("deviceId")
            ?: return reject(call, "USB_DEVICE_NOT_FOUND", "缺少 deviceId")
        val device = findDevice(manager, deviceId)
            ?: return reject(call, "USB_DEVICE_NOT_FOUND", "USB 设备不存在")
        if (!manager.hasPermission(device)) {
            return reject(
                call,
                "USB_PERMISSION_REQUIRED",
                "尚未获得 USB 设备访问权限",
            )
        }

        val driver = UsbSerialProber.getDefaultProber().probeDevice(device)
        if (driver == null || driver.ports.isEmpty()) {
            return reject(
                call,
                "SERIAL_DRIVER_NOT_FOUND",
                "没有找到适用于该设备的 USB 串口驱动",
            )
        }

        val requestedParity = call.getString("parity") ?: "none"
        val parity = when (requestedParity) {
            "none" -> UsbSerialPort.PARITY_NONE
            "even" -> UsbSerialPort.PARITY_EVEN
            "odd" -> UsbSerialPort.PARITY_ODD
            "mark" -> UsbSerialPort.PARITY_MARK
            "space" -> UsbSerialPort.PARITY_SPACE
            else -> return reject(
                call,
                "INVALID_SERIAL_CONFIG",
                "校验位参数不正确",
            )
        }
        val dataBits = call.getInt("dataBits") ?: 8
        if (dataBits !in 5..8) {
            return reject(
                call,
                "INVALID_SERIAL_CONFIG",
                "数据位必须为 5、6、7 或 8",
            )
        }
        val stopBits = call.getDouble("stopBits") ?: 1.0
        val stopBitsConstant = when (stopBits) {
            1.0 -> UsbSerialPort.STOPBITS_1
            1.5 -> UsbSerialPort.STOPBITS_1_5
            2.0 -> UsbSerialPort.STOPBITS_2
            else -> return reject(
                call,
                "INVALID_SERIAL_CONFIG",
                "停止位参数不正确",
            )
        }
        val requestedBaudRate = call.getInt("baudRate") ?: 9600
        if (requestedBaudRate <= 0) {
            return reject(
                call,
                "INVALID_SERIAL_CONFIG",
                "波特率必须大于 0",
            )
        }
        val flowControl = call.getString("flowControl") ?: "none"
        Log.i(
            TAG,
            "open: id=${device.deviceId} vid=${hex4(device.vendorId)} " +
                "pid=${hex4(device.productId)} driver=${driverName(driver)} " +
                "baud=$requestedBaudRate dataBits=$dataBits " +
                "stopBits=$stopBits parity=$requestedParity",
        )

        closePortInternal()
        val openedConnection = manager.openDevice(device)
            ?: return reject(
                call,
                "USB_OPEN_FAILED",
                "UsbManager.openDevice() 返回空值",
            )
        val openedPort = driver.ports[0]
        try {
            openedPort.open(openedConnection)
            openedPort.setParameters(
                requestedBaudRate,
                dataBits,
                stopBitsConstant,
                parity,
            )
            if (flowControl != "none") {
                val nativeFlowControl = when (flowControl) {
                    "hardware" -> UsbSerialPort.FlowControl.RTS_CTS
                    "software" -> UsbSerialPort.FlowControl.XON_XOFF
                    else -> throw IllegalArgumentException("未知流控类型")
                }
                openedPort.setFlowControl(nativeFlowControl)
            }
        } catch (error: UnsupportedOperationException) {
            Log.e(TAG, "open: unsupported parameters", error)
            closePartialOpen(openedPort, openedConnection)
            return reject(
                call,
                "INVALID_SERIAL_CONFIG",
                error.message ?: "当前串口设备不支持所选参数",
            )
        } catch (error: IllegalArgumentException) {
            Log.e(TAG, "open: invalid parameters", error)
            closePartialOpen(openedPort, openedConnection)
            return reject(
                call,
                "INVALID_SERIAL_CONFIG",
                error.message ?: "串口参数不合法",
            )
        } catch (error: IOException) {
            Log.e(TAG, "open: IO error", error)
            closePartialOpen(openedPort, openedConnection)
            return reject(
                call,
                "SERIAL_OPEN_FAILED",
                error.message ?: "打开串口失败",
            )
        }

        port = openedPort
        connection = openedConnection
        currentDeviceId = device.deviceId
        baudRate = requestedBaudRate
        state = "connected"
        errorCode = null
        errorDetail = null
        manualClose = false
        startReadLoop()
        Log.i(TAG, "open: success id=${device.deviceId}")
        notifyStatus()
        call.resolve()
    }

    @PluginMethod
    fun write(call: PluginCall) {
        val currentPort = port
        if (state != "connected" || currentPort == null) {
            return reject(
                call,
                "SERIAL_DEVICE_DISCONNECTED",
                "串口尚未连接",
            )
        }

        val encoded = call.getString("dataBase64")
            ?: return reject(
                call,
                "SERIAL_WRITE_FAILED",
                "缺少 Base64 串口数据",
            )
        val bytes = try {
            Base64.decode(encoded, Base64.DEFAULT)
        } catch (error: IllegalArgumentException) {
            return reject(
                call,
                "SERIAL_WRITE_FAILED",
                error.message ?: "串口数据不是有效的 Base64",
            )
        }

        try {
            currentPort.write(bytes, WRITE_TIMEOUT_MS)
            Log.i(TAG, "write: ${bytes.size} bytes ok")
            call.resolve()
        } catch (error: IOException) {
            val detail = error.message ?: "USB 串口写入失败"
            Log.e(TAG, "write: failed", error)
            state = "error"
            errorCode = "SERIAL_WRITE_FAILED"
            errorDetail = detail
            closePortInternal()
            notifyStatus()
            reject(call, "SERIAL_WRITE_FAILED", detail)
        }
    }

    @PluginMethod
    fun close(call: PluginCall) {
        Log.i(TAG, "close: manual disconnect")
        manualClose = true
        closePortInternal()
        currentDeviceId = null
        state = "disconnected"
        errorCode = null
        errorDetail = null
        notifyStatus()
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(statusToObject())
    }

    override fun handleOnDestroy() {
        manualClose = true
        clearPendingPermission()
        closePortInternal()
        readExecutor.shutdownNow()
        unregisterReceiver(permissionReceiver)
        unregisterReceiver(usbEventReceiver)
        super.handleOnDestroy()
    }

    private fun startReadLoop() {
        if (!reading.compareAndSet(false, true)) {
            return
        }
        readExecutor.execute {
            val buffer = ByteArray(1024)
            while (reading.get()) {
                val currentPort = port ?: break
                try {
                    val count = currentPort.read(buffer, READ_TIMEOUT_MS)
                    if (count > 0) {
                        val encoded = Base64.encodeToString(
                            buffer.copyOf(count),
                            Base64.NO_WRAP,
                        )
                        notifyListeners(
                            "data",
                            JSObject().put("dataBase64", encoded),
                        )
                    }
                } catch (error: IOException) {
                    reading.set(false)
                    if (!manualClose) {
                        mainHandler.post {
                            handleReadFailure(error)
                        }
                    }
                    break
                }
            }
        }
    }

    private fun handleReadFailure(error: IOException) {
        Log.e(TAG, "read loop failed", error)
        closePortInternal()
        currentDeviceId = null
        state = "error"
        errorCode = "SERIAL_DEVICE_DISCONNECTED"
        errorDetail = error.message ?: "USB 串口读取失败，设备可能已拔出"
        notifyStatus()
    }

    private fun closePortInternal() {
        reading.set(false)
        val currentPort = port
        val currentConnection = connection
        port = null
        connection = null
        try {
            currentPort?.close()
        } catch (_: IOException) {
        }
        try {
            currentConnection?.close()
        } catch (_: RuntimeException) {
        }
    }

    private fun closePartialOpen(
        partialPort: UsbSerialPort,
        partialConnection: UsbDeviceConnection,
    ) {
        try {
            partialPort.close()
        } catch (_: IOException) {
        }
        try {
            partialConnection.close()
        } catch (_: RuntimeException) {
        }
    }

    private fun preferredDevice(manager: UsbManager): UsbDevice? {
        val devices = manager.deviceList.values
        return devices.firstOrNull {
            it.vendorId == CH340_VENDOR_ID && it.productId == CH340_PRODUCT_ID
        } ?: devices.firstOrNull()
    }

    private fun findDevice(
        manager: UsbManager,
        deviceId: String,
    ): UsbDevice? {
        val numericId = deviceId.toIntOrNull()
        return manager.deviceList.values.firstOrNull {
            it.deviceId == numericId || it.deviceId.toString() == deviceId
        }
    }

    private fun deviceToObject(
        manager: UsbManager?,
        device: UsbDevice,
        driver: UsbSerialDriver?,
    ): JSObject {
        val supported = driver != null && driver.ports.isNotEmpty()
        val hasPermission = try {
            manager?.hasPermission(device) == true
        } catch (_: RuntimeException) {
            false
        }
        return JSObject()
            .put("deviceId", device.deviceId.toString())
            .put("vendorId", hex4(device.vendorId))
            .put("productId", hex4(device.productId))
            .put("manufacturer", safeDeviceValue { device.manufacturerName })
            .put("productName", safeDeviceValue { device.productName })
            .put("serialNumber", safeDeviceValue { device.serialNumber })
            .put("driverName", driverName(driver))
            .put("portCount", driver?.ports?.size ?: 0)
            .put("supported", supported)
            .put("hasPermission", hasPermission)
    }

    private fun statusToObject(): JSObject {
        return JSObject()
            .put("state", state)
            .put("deviceId", currentDeviceId?.toString())
            .put("baudRate", baudRate)
            .put("connected", state == "connected" && port != null)
            .put("errorCode", errorCode)
            .put("detail", errorDetail)
    }

    private fun notifyStatus() {
        // hardwareState 只在真正变化时打一条，便于和前端 canControl 日志对照
        if (state != lastLoggedState) {
            lastLoggedState = state
            Log.i(
                TAG,
                "hardwareState=$state deviceId=$currentDeviceId " +
                    "connected=${state == "connected" && port != null} " +
                    "baudRate=$baudRate errorCode=$errorCode detail=$errorDetail",
            )
        }
        notifyListeners("statusChange", statusToObject())
    }

    private fun clearPendingPermission() {
        permissionTimeout?.let(mainHandler::removeCallbacks)
        permissionTimeout = null
        pendingPermissionCall = null
        pendingPermissionDeviceId = null
    }

    private fun registerReceiver(
        receiver: BroadcastReceiver,
        filter: IntentFilter,
    ) {
        ContextCompat.registerReceiver(
            context,
            receiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    private fun unregisterReceiver(receiver: BroadcastReceiver) {
        try {
            context.unregisterReceiver(receiver)
        } catch (_: IllegalArgumentException) {
        }
    }

    private fun reject(
        call: PluginCall,
        code: String,
        detail: String,
    ) {
        call.reject(detail, code, JSObject().put("code", code).put("detail", detail))
    }

    private fun driverName(driver: UsbSerialDriver?): String? {
        val simpleName = driver?.javaClass?.simpleName ?: return null
        return when (simpleName) {
            "Ch34xSerialDriver" -> "CH340"
            "Cp21xxSerialDriver" -> "CP210x"
            "FtdiSerialDriver" -> "FTDI"
            "CdcAcmSerialDriver" -> "CDC ACM"
            else -> simpleName.removeSuffix("SerialDriver")
        }
    }

    private fun safeDeviceValue(value: () -> String?): String? {
        return try {
            value()
        } catch (_: SecurityException) {
            null
        }
    }

    private fun hex4(value: Int): String {
        return String.format(Locale.US, "%04X", value)
    }
}
