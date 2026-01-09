"""
生成 Qwen-TTS 扩展图标的脚本
运行：python generate_icons.py
"""

import base64
import os

# 简单的 PNG 图标数据（紫色背景带白色喇叭图标）
# 这些是预生成的简单图标

def create_simple_icon(size):
    """创建简单的 SVG 图标并转换为 PNG 格式的 base64"""
    # 使用 PIL 创建图标
    try:
        from PIL import Image, ImageDraw

        # 创建图像
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # 绘制圆形背景
        padding = size // 10
        draw.ellipse([padding, padding, size - padding, size - padding], fill=(99, 102, 241))

        # 绘制简单的喇叭形状
        center = size // 2
        scale = size / 48

        # 喇叭主体（简化的三角形）
        speaker_points = [
            (center - 6 * scale, center - 8 * scale),
            (center - 6 * scale, center + 8 * scale),
            (center + 2 * scale, center + 12 * scale),
            (center + 2 * scale, center - 12 * scale),
        ]
        draw.polygon(speaker_points, fill='white')

        # 声波线条
        for i, offset in enumerate([6, 10]):
            x = center + offset * scale
            draw.arc(
                [x - 4 * scale, center - (8 - i * 2) * scale,
                 x + 4 * scale, center + (8 - i * 2) * scale],
                start=-60, end=60, fill='white', width=max(1, int(2 * scale))
            )

        return img

    except ImportError:
        print("需要安装 Pillow: pip install Pillow")
        return None


def main():
    sizes = [16, 32, 48, 128]
    icons_dir = os.path.dirname(os.path.abspath(__file__))
    icons_path = os.path.join(icons_dir, 'icons')

    os.makedirs(icons_path, exist_ok=True)

    for size in sizes:
        img = create_simple_icon(size)
        if img:
            filepath = os.path.join(icons_path, f'icon{size}.png')
            img.save(filepath, 'PNG')
            print(f'创建图标: {filepath}')
        else:
            print(f'跳过 {size}x{size} 图标（需要安装 Pillow）')

    print("\n图标生成完成！")
    print("如果没有安装 Pillow，请运行: pip install Pillow")


if __name__ == '__main__':
    main()
