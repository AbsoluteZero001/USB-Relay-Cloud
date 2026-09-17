package com.absolutezero.usbrelaycloud.mapper;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.entity.RelayStateEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.Instant;
import java.util.List;

@Mapper
public interface RelayStateMapper extends BaseMapper<RelayStateEntity> {

    @Insert("""
            INSERT INTO relay_state (
                device_id, channel, commanded_state, command_status,
                hardware_state, last_event_id, last_event_sequence, updated_at
            ) VALUES (
                #{deviceId}, #{channel}, #{commandedState}, #{commandStatus},
                'UNKNOWN', #{lastEventId}, #{lastEventSequence}, #{updatedAt}
            )
            ON DUPLICATE KEY UPDATE
                commanded_state = VALUES(commanded_state),
                command_status = VALUES(command_status),
                hardware_state = 'UNKNOWN',
                last_event_id = VALUES(last_event_id),
                last_event_sequence = VALUES(last_event_sequence),
                updated_at = VALUES(updated_at)
            """)
    int upsertLastCommand(
            @Param("deviceId") String deviceId,
            @Param("channel") int channel,
            @Param("commandedState") RelayStateValue commandedState,
            @Param("commandStatus") CommandStatus commandStatus,
            @Param("lastEventId") String lastEventId,
            @Param("lastEventSequence") long lastEventSequence,
            @Param("updatedAt") Instant updatedAt
    );

    @Select("""
            SELECT id, device_id, channel, commanded_state, command_status,
                   hardware_state, last_event_id, last_event_sequence, updated_at
            FROM relay_state
            WHERE device_id = #{deviceId}
            ORDER BY channel ASC
            """)
    List<RelayStateEntity> selectByDeviceId(@Param("deviceId") String deviceId);

    @Select("""
            SELECT id, device_id, channel, commanded_state, command_status,
                   hardware_state, last_event_id, last_event_sequence, updated_at
            FROM relay_state
            WHERE device_id = #{deviceId}
              AND channel = #{channel}
            """)
    RelayStateEntity selectByDeviceChannel(
            @Param("deviceId") String deviceId,
            @Param("channel") int channel
    );
}
