package com.absolutezero.usbrelaycloud.mapper;

import com.absolutezero.usbrelaycloud.entity.HardwareEventEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.Instant;

@Mapper
public interface HardwareEventMapper extends BaseMapper<HardwareEventEntity> {

    @Insert("""
            INSERT IGNORE INTO hardware_event (
                event_id, device_id, event_type, source, client_id,
                profile_name, serial_device, vendor_id, product_id,
                baud_rate, data_bits, stop_bits, parity, channel,
                actor_user_id, actor_username, actor_client_id, executor_client_id,
                error_code, error_message, created_at
            ) VALUES (
                #{event.eventId}, #{event.deviceId}, #{event.eventType}, #{event.source}, #{event.clientId},
                #{event.profileName}, #{event.serialDevice}, #{event.vendorId}, #{event.productId},
                #{event.baudRate}, #{event.dataBits}, #{event.stopBits}, #{event.parity}, #{event.channel},
                #{event.actorUserId}, #{event.actorUsername}, #{event.actorClientId}, #{event.executorClientId},
                #{event.errorCode}, #{event.errorMessage}, #{event.createdAt}
            )
            """)
    int insertIgnore(@Param("event") HardwareEventEntity event);

    @Select("""
            SELECT id, event_id, device_id, event_type, source, client_id,
                   profile_name, serial_device, vendor_id, product_id,
                   baud_rate, data_bits, stop_bits, parity, channel,
                   actor_user_id, actor_username, actor_client_id, executor_client_id,
                   error_code, error_message, created_at
            FROM hardware_event
            WHERE event_id = #{eventId}
            """)
    HardwareEventEntity selectByEventId(@Param("eventId") String eventId);

    @Select("""
            <script>
            SELECT id, event_id, device_id, event_type, source, client_id,
                   profile_name, serial_device, vendor_id, product_id,
                   baud_rate, data_bits, stop_bits, parity, channel,
                   actor_user_id, actor_username, actor_client_id, executor_client_id,
                   error_code, error_message, created_at
            FROM hardware_event
            WHERE device_id = #{deviceId}
            <if test="from != null">
              AND created_at &gt;= #{from}
            </if>
            <if test="to != null">
              AND created_at &lt;= #{to}
            </if>
            ORDER BY id DESC
            </script>
            """)
    Page<HardwareEventEntity> selectEventPage(
            Page<HardwareEventEntity> page,
            @Param("deviceId") String deviceId,
            @Param("from") Instant from,
            @Param("to") Instant to
    );
}
