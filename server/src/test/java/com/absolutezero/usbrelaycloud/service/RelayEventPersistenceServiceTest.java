package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.dto.RelayEventCreateRequest;
import com.absolutezero.usbrelaycloud.entity.RelayStateEntity;
import com.absolutezero.usbrelaycloud.mapper.RelayEventMapper;
import com.absolutezero.usbrelaycloud.mapper.RelayStateMapper;
import com.absolutezero.usbrelaycloud.service.model.EventPersistenceResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("test")
@SpringBootTest
class RelayEventPersistenceServiceTest {

    @Autowired
    private RelayEventPersistenceService persistenceService;

    @Autowired
    private RelayEventMapper relayEventMapper;

    @Autowired
    private RelayStateMapper relayStateMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanDatabase() {
        jdbcTemplate.update("DELETE FROM relay_event");
        jdbcTemplate.update("DELETE FROM relay_state");
        jdbcTemplate.update("DELETE FROM device");
    }

    @Test
    void insertsEventAndUpsertsRelayState() {
        RelayEventCreateRequest request = event(
                "00000000-0000-4000-8000-000000000001",
                RelayAction.ON,
                RelayStateValue.OFF,
                RelayStateValue.ON,
                CommandStatus.SUCCESS
        );

        EventPersistenceResult result =
                persistenceService.recordEvent("relay-001", request);

        assertThat(result.created()).isTrue();
        assertThat(result.event().getId()).isPositive();
        assertThat(relayEventMapper.selectByEventId(request.eventId()))
                .isNotNull();

        RelayStateEntity state =
                relayStateMapper.selectByDeviceChannel("relay-001", 1);
        assertThat(state.getCommandedState())
                .isEqualTo(RelayStateValue.ON);
        assertThat(state.getCommandStatus())
                .isEqualTo(CommandStatus.SUCCESS);
        assertThat(state.getHardwareState())
                .isEqualTo(RelayStateValue.UNKNOWN);
        assertThat(state.getLastEventId()).isEqualTo(request.eventId());
        assertThat(state.getLastEventSequence())
                .isEqualTo(result.event().getId());
    }

    @Test
    void duplicateEventIdDoesNotCreateAnotherLogOrChangeState() {
        RelayEventCreateRequest first = event(
                "00000000-0000-4000-8000-000000000002",
                RelayAction.ON,
                RelayStateValue.OFF,
                RelayStateValue.ON,
                CommandStatus.SUCCESS
        );
        EventPersistenceResult original =
                persistenceService.recordEvent("relay-001", first);

        RelayEventCreateRequest retryWithDifferentPayload = event(
                first.eventId(),
                RelayAction.OFF,
                RelayStateValue.ON,
                RelayStateValue.OFF,
                CommandStatus.SUCCESS
        );
        EventPersistenceResult replay =
                persistenceService.recordEvent(
                        "relay-001",
                        retryWithDifferentPayload
                );

        assertThat(replay.created()).isFalse();
        assertThat(replay.event().getId()).isEqualTo(original.event().getId());
        assertThat(replay.event().getAction()).isEqualTo(RelayAction.ON);
        assertThat(countRows("relay_event")).isEqualTo(1);

        RelayStateEntity state =
                relayStateMapper.selectByDeviceChannel("relay-001", 1);
        assertThat(state.getCommandedState())
                .isEqualTo(RelayStateValue.ON);
        assertThat(state.getLastEventSequence())
                .isEqualTo(original.event().getId());
    }

    @Test
    void laterEventReplacesLastCommandState() {
        persistenceService.recordEvent(
                "relay-001",
                event(
                        "00000000-0000-4000-8000-000000000003",
                        RelayAction.OFF,
                        RelayStateValue.UNKNOWN,
                        RelayStateValue.OFF,
                        CommandStatus.SUCCESS
                )
        );
        EventPersistenceResult latest = persistenceService.recordEvent(
                "relay-001",
                event(
                        "00000000-0000-4000-8000-000000000004",
                        RelayAction.ON,
                        RelayStateValue.OFF,
                        RelayStateValue.ON,
                        CommandStatus.SUCCESS
                )
        );

        RelayStateEntity state =
                relayStateMapper.selectByDeviceChannel("relay-001", 1);
        assertThat(state.getCommandedState())
                .isEqualTo(RelayStateValue.ON);
        assertThat(state.getLastEventId())
                .isEqualTo(latest.event().getEventId());
        assertThat(state.getLastEventSequence())
                .isEqualTo(latest.event().getId());
    }

    /**
     * spec §19：FAILED 事件不得更新 relay_state。
     * 先以 SUCCESS 写入 ON，再以 FAILED 提交 OFF，
     * 状态应仍保持 SUCCESS 那一条。
     */
    @Test
    void failedEventDoesNotUpdateRelayState() {
        String successEventId =
                "00000000-0000-4000-8000-000000000010";
        String failedEventId =
                "00000000-0000-4000-8000-000000000011";

        persistenceService.recordEvent(
                "relay-001",
                event(
                        successEventId,
                        RelayAction.ON,
                        RelayStateValue.OFF,
                        RelayStateValue.ON,
                        CommandStatus.SUCCESS
                )
        );

        EventPersistenceResult failedResult = persistenceService.recordEvent(
                "relay-001",
                event(
                        failedEventId,
                        RelayAction.OFF,
                        RelayStateValue.ON,
                        RelayStateValue.OFF,
                        CommandStatus.FAILED
                )
        );

        // FAILED 事件本身仍然记录到 relay_event
        assertThat(failedResult.created()).isTrue();
        assertThat(relayEventMapper.selectByEventId(failedEventId))
                .isNotNull();

        // 但 relay_state 应仍指向 SUCCESS 那一条
        RelayStateEntity state =
                relayStateMapper.selectByDeviceChannel("relay-001", 1);
        assertThat(state.getCommandedState())
                .isEqualTo(RelayStateValue.ON);
        assertThat(state.getCommandStatus())
                .isEqualTo(CommandStatus.SUCCESS);
        assertThat(state.getLastEventId()).isEqualTo(successEventId);
    }

    private RelayEventCreateRequest event(
            String eventId,
            RelayAction action,
            RelayStateValue previousState,
            RelayStateValue currentState,
            CommandStatus status
    ) {
        return new RelayEventCreateRequest(
                eventId,
                1,
                action,
                previousState,
                currentState,
                status,
                EventSource.ANDROID,
                "android-tablet-001"
        );
    }

    private long countRows(String table) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + table,
                Long.class
        );
        return count == null ? 0 : count;
    }
}
