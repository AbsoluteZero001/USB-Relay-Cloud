package com.absolutezero.usbrelaycloud.security;

import com.absolutezero.usbrelaycloud.common.enums.GlobalRole;
import com.absolutezero.usbrelaycloud.common.enums.UserStatus;
import com.absolutezero.usbrelaycloud.config.BootstrapAdminProperties;
import com.absolutezero.usbrelaycloud.entity.SysUserEntity;
import com.absolutezero.usbrelaycloud.mapper.SysUserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Arrays;

/**
 * 启动时若 sys_user 表为空，且 APP_BOOTSTRAP_ADMIN_USERNAME /
 * APP_BOOTSTRAP_ADMIN_PASSWORD 两个环境变量都存在，则使用 BCrypt
 * 哈希创建初始 ADMIN 账号。
 * <p>
 * 若表中已有用户，绝不重复创建。
 * 若生产环境未配置 bootstrap password，绝不生成弱默认密码。
 */
@Component
public class BootstrapAdminInitializer implements ApplicationRunner {

    private static final Logger log =
            LoggerFactory.getLogger(BootstrapAdminInitializer.class);

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final BootstrapAdminProperties props;
    private final Environment environment;

    public BootstrapAdminInitializer(
            SysUserMapper sysUserMapper,
            PasswordEncoder passwordEncoder,
            BootstrapAdminProperties props,
            Environment environment
    ) {
        this.sysUserMapper = sysUserMapper;
        this.passwordEncoder = passwordEncoder;
        this.props = props;
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (sysUserMapper.count() > 0) {
            return;
        }
        if (props == null
                || isBlank(props.username())
                || isBlank(props.password())) {
            boolean isProd = Arrays.asList(environment.getActiveProfiles())
                    .contains("prod");
            if (isProd) {
                log.warn(
                        "sys_user is empty and APP_BOOTSTRAP_ADMIN_USERNAME/"
                                + "APP_BOOTSTRAP_ADMIN_PASSWORD is not set; "
                                + "no admin account will be created. "
                                + "Configure these env vars before first "
                                + "production startup."
                );
            }
            return;
        }
        Instant now = Instant.now();
        SysUserEntity admin = new SysUserEntity();
        admin.setUsername(props.username().trim());
        admin.setPasswordHash(passwordEncoder.encode(props.password()));
        admin.setGlobalRole(GlobalRole.ADMIN);
        admin.setStatus(UserStatus.ACTIVE);
        admin.setCreatedAt(now);
        admin.setUpdatedAt(now);
        sysUserMapper.insert(admin);
        log.info(
                "Bootstrap admin '{}' created with role ADMIN",
                admin.getUsername()
        );
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
