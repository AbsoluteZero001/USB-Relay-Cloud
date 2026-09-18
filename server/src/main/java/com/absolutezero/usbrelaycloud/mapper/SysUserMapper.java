package com.absolutezero.usbrelaycloud.mapper;

import com.absolutezero.usbrelaycloud.entity.SysUserEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface SysUserMapper extends BaseMapper<SysUserEntity> {

    @Select("""
            SELECT id, username, password_hash, global_role, status,
                   created_at, updated_at
            FROM sys_user
            WHERE username = #{username}
            """)
    SysUserEntity selectByUsername(@Param("username") String username);

    @Select("SELECT COUNT(*) FROM sys_user")
    long count();
}
