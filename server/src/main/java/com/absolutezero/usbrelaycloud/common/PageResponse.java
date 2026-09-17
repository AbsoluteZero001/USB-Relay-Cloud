package com.absolutezero.usbrelaycloud.common;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

import java.util.List;
import java.util.function.Function;

public record PageResponse<T>(
        List<T> records,
        long page,
        long pageSize,
        long total,
        long totalPages
) {

    public static <S, T> PageResponse<T> from(
            Page<S> source,
            Function<S, T> mapper
    ) {
        return new PageResponse<>(
                source.getRecords().stream().map(mapper).toList(),
                source.getCurrent(),
                source.getSize(),
                source.getTotal(),
                source.getPages()
        );
    }

    public static <T> PageResponse<T> of(
            List<T> records,
            long page,
            long pageSize,
            long total
    ) {
        long totalPages = pageSize == 0 ? 0 : (total + pageSize - 1) / pageSize;
        return new PageResponse<>(records, page, pageSize, total, totalPages);
    }
}
