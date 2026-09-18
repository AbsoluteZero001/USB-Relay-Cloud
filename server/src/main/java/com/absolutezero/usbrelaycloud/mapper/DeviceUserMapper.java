package com.absolutezero.usbrelaycloud.mapper;

import com.absolutezero.usbrelaycloud.entity.DeviceUserEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * Phase 4：仅提供基础查询。
 * Phase 5 将在 DeviceService 中接入设备级权限校验。
 */
@Mapper
public interface DeviceUserMapper extends BaseMapper<DeviceUserEntity> {

    @Select("""
            SELECT id, user_id, device_id, role, created_at
            FROM device_user
            WHERE user_id = #{userId}
              AND device_id = #{deviceId}
            """)
    DeviceUserEntity selectByUserAndDevice(
            @Param("userId") Long userId,
            @Param("deviceId") String deviceId
    );

    @Select("""
            SELECT device_id
            FROM device_user
            WHERE user_id = #{userId}
            """)
    List<String> selectDeviceIdsByUser(@Param("userId") Long userId);
}
