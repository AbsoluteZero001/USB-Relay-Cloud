package com.absolutezero.usbrelaycloud.mapper;

import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.Instant;
import java.util.List;

@Mapper
public interface RelayEventMapper extends BaseMapper<RelayEventEntity> {

    @Insert("""
            INSERT IGNORE INTO relay_event (
                event_id, device_id, channel, action, previous_state,
                current_state, command_status, source, client_id, created_at
            ) VALUES (
                #{event.eventId}, #{event.deviceId}, #{event.channel}, #{event.action},
                #{event.previousState}, #{event.currentState}, #{event.commandStatus},
                #{event.source}, #{event.clientId}, #{event.createdAt}
            )
            """)
    int insertIgnore(@Param("event") RelayEventEntity event);

    @Select("""
            SELECT id, event_id, device_id, channel, action, previous_state,
                   current_state, command_status, source, client_id, created_at
            FROM relay_event
            WHERE event_id = #{eventId}
            """)
    RelayEventEntity selectByEventId(@Param("eventId") String eventId);

    @Select("""
            SELECT id, event_id, device_id, channel, action, previous_state,
                   current_state, command_status, source, client_id, created_at
            FROM relay_event
            WHERE id > #{afterSequence}
            ORDER BY id ASC
            LIMIT #{limit}
            """)
    List<RelayEventEntity> selectAfterSequence(
            @Param("afterSequence") long afterSequence,
            @Param("limit") int limit
    );

    @Select("""
            <script>
            SELECT id, event_id, device_id, channel, action, previous_state,
                   current_state, command_status, source, client_id, created_at
            FROM relay_event
            WHERE device_id = #{deviceId}
            <if test="afterSequence != null">
              AND id &gt; #{afterSequence}
            </if>
            <if test="from != null">
              AND created_at &gt;= #{from}
            </if>
            <if test="to != null">
              AND created_at &lt;= #{to}
            </if>
            <if test="action != null">
              AND action = #{action}
            </if>
            <if test="source != null">
              AND source = #{source}
            </if>
            ORDER BY id DESC
            </script>
            """)
    Page<RelayEventEntity> selectEventPage(
            Page<RelayEventEntity> page,
            @Param("deviceId") String deviceId,
            @Param("afterSequence") Long afterSequence,
            @Param("from") Instant from,
            @Param("to") Instant to,
            @Param("action") RelayAction action,
            @Param("source") EventSource source
    );
}
