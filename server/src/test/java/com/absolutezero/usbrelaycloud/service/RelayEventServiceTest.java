package com.absolutezero.usbrelaycloud.service;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.EventSource;
import com.absolutezero.usbrelaycloud.common.enums.RelayAction;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.dto.RelayEventCreateRequest;
import com.absolutezero.usbrelaycloud.entity.RelayEventEntity;
import com.absolutezero.usbrelaycloud.exception.BusinessException;
import com.absolutezero.usbrelaycloud.service.model.EventPersistenceResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RelayEventServiceTest {

    @Mock
    private RelayEventPersistenceService persistenceService;

    @Mock
    private DeviceBroadcastService broadcastService;

    @InjectMocks
    private RelayEventService service;

    @Test
    void broadcastsOnlyAfterNewEventIsPersisted() {
        RelayEventCreateRequest request = event(
                RelayAction.ON,
                RelayStateValue.OFF,
                RelayStateValue.ON
        );
        RelayEventEntity entity = entity(request);
        when(persistenceService.recordEvent("relay-001", request))
                .thenReturn(new EventPersistenceResult(entity, true));

        service.record("relay-001", request);

        verify(broadcastService).broadcastRelayEvent(entity);
    }

    @Test
    void duplicateEventIsNotBroadcastAgain() {
        RelayEventCreateRequest request = event(
                RelayAction.ON,
                RelayStateValue.OFF,
                RelayStateValue.ON
        );
        RelayEventEntity entity = entity(request);
        when(persistenceService.recordEvent("relay-001", request))
                .thenReturn(new EventPersistenceResult(entity, false));

        service.record("relay-001", request);

        verify(broadcastService, never()).broadcastRelayEvent(entity);
    }

    @Test
    void rejectsActionThatDoesNotMatchCurrentState() {
        RelayEventCreateRequest request = event(
                RelayAction.ON,
                RelayStateValue.OFF,
                RelayStateValue.OFF
        );

        assertThatThrownBy(() -> service.record("relay-001", request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("action and currentState");
    }

    private RelayEventCreateRequest event(
            RelayAction action,
            RelayStateValue previous,
            RelayStateValue current
    ) {
        return new RelayEventCreateRequest(
                "00000000-0000-4000-8000-000000000010",
                1,
                action,
                previous,
                current,
                CommandStatus.SUCCESS,
                EventSource.ANDROID,
                "android-tablet-001"
        );
    }

    private RelayEventEntity entity(RelayEventCreateRequest request) {
        RelayEventEntity entity = new RelayEventEntity();
        entity.setId(1L);
        entity.setEventId(request.eventId());
        entity.setDeviceId("relay-001");
        entity.setChannel(request.channel());
        entity.setAction(request.action());
        entity.setPreviousState(request.previousState());
        entity.setCurrentState(request.currentState());
        entity.setCommandStatus(request.commandStatus());
        entity.setSource(request.source());
        entity.setClientId(request.clientId());
        return entity;
    }
}
