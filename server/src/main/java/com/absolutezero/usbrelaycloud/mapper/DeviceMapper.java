package com.absolutezero.usbrelaycloud.mapper;

import com.absolutezero.usbrelaycloud.entity.DeviceEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.Instant;
import java.util.List;

@Mapper
public interface DeviceMapper extends BaseMapper<DeviceEntity> {

    @Insert("""
            INSERT INTO device (
                device_id, device_name, device_type, online_status,
                last_seen, created_at, updated_at
            ) VALUES (
                #{deviceId}, #{deviceName}, #{deviceType}, 'ONLINE',
                #{seenAt}, #{seenAt}, #{seenAt}
            )
            ON DUPLICATE KEY UPDATE
                device_name = COALESCE(
                    NULLIF(device_name, ''),
                    VALUES(device_name)
                ),
                device_type = COALESCE(
                    NULLIF(device_type, ''),
                    VALUES(device_type)
                ),
                online_status = 'ONLINE',
                last_seen = VALUES(last_seen),
                updated_at = VALUES(updated_at)
            """)
    int upsertActiveDevice(
            @Param("deviceId") String deviceId,
            @Param("deviceName") String deviceName,
            @Param("deviceType") String deviceType,
            @Param("seenAt") Instant seenAt
    );

    @Select("""
            SELECT id, device_id, device_name, device_type, online_status,
                   last_seen, created_at, updated_at
            FROM device
            WHERE device_id = #{deviceId}
            FOR UPDATE
            """)
    DeviceEntity selectByDeviceIdForUpdate(@Param("deviceId") String deviceId);

    @Select("""
            SELECT id, device_id, device_name, device_type, online_status,
                   last_seen, created_at, updated_at
            FROM device
            WHERE device_id = #{deviceId}
            """)
    DeviceEntity selectByDeviceId(@Param("deviceId") String deviceId);

    @Select("""
            SELECT id, device_id, device_name, device_type, online_status,
                   last_seen, created_at, updated_at
            FROM device
            WHERE online_status = 'ONLINE'
              AND last_seen IS NOT NULL
              AND last_seen < #{threshold}
            ORDER BY last_seen ASC
            LIMIT #{limit}
            """)
    List<DeviceEntity> selectStaleOnlineDevices(
            @Param("threshold") Instant threshold,
            @Param("limit") int limit
    );

    @Update("""
            UPDATE device
            SET online_status = 'OFFLINE',
                updated_at = #{updatedAt}
            WHERE device_id = #{deviceId}
              AND online_status = 'ONLINE'
            """)
    int markOffline(
            @Param("deviceId") String deviceId,
            @Param("updatedAt") Instant updatedAt
    );
}
