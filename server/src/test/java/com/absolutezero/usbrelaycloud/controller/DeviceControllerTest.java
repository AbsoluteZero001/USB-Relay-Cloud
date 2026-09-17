package com.absolutezero.usbrelaycloud.controller;

import com.absolutezero.usbrelaycloud.common.enums.CommandStatus;
import com.absolutezero.usbrelaycloud.common.enums.RelayStateValue;
import com.absolutezero.usbrelaycloud.exception.GlobalExceptionHandler;
import com.absolutezero.usbrelaycloud.service.DeviceService;
import com.absolutezero.usbrelaycloud.service.RelayEventService;
import com.absolutezero.usbrelaycloud.vo.RelayStateResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class DeviceControllerTest {

    private MockMvc mockMvc;

    @Mock
    private DeviceService deviceService;

    @Mock
    private RelayEventService relayEventService;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper =
                new ObjectMapper().findAndRegisterModules();
        mockMvc = MockMvcBuilders
                .standaloneSetup(
                        new DeviceController(
                                deviceService,
                                relayEventService
                        )
                )
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(
                        new MappingJackson2HttpMessageConverter(objectMapper)
                )
                .build();
    }

    @Test
    void returnsRelayState() throws Exception {
        when(deviceService.state("relay-001", 1)).thenReturn(
                new RelayStateResponse(
                        "relay-001",
                        1,
                        RelayStateValue.ON,
                        CommandStatus.SUCCESS,
                        RelayStateValue.UNKNOWN,
                        "00000000-0000-4000-8000-000000000001",
                        1L,
                        Instant.parse("2026-09-17T14:32:18Z")
                )
        );

        mockMvc.perform(get("/api/devices/relay-001/state"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.commandedState").value("ON"))
                .andExpect(jsonPath("$.data.hardwareState")
                        .value("UNKNOWN"));
    }

    @Test
    void rejectsInvalidEventBeforeCallingService() throws Exception {
        String body = """
                {
                  "eventId": "not-a-uuid",
                  "channel": 1,
                  "action": "ON",
                  "previousState": "OFF",
                  "currentState": "ON",
                  "commandStatus": "SUCCESS",
                  "source": "ANDROID",
                  "clientId": "android-tablet-001"
                }
                """;

        mockMvc.perform(
                        post("/api/devices/relay-001/events")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body)
                )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.data.eventId").exists());

        verifyNoInteractions(relayEventService);
    }
}
