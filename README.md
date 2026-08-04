# 小语今天吃什么

一个为 iPhone 设计的轻量食物轮盘 PWA。候选数据只保存在当前浏览器，可安装到主屏幕并在首次加载后离线使用。

## 本地运行

在项目目录启动静态服务器：

```powershell
python -m http.server 4173
```

然后访问 `http://localhost:4173`。

## 数据说明

- 第一次打开会载入一组可删除的示例候选。
- 食物和饭店名保存在浏览器 `localStorage` 中，不会上传或跨设备同步。
- 清除浏览器网站数据会同时删除自定义候选。

## 开源组件

- [spin-wheel 5.0.2](https://github.com/CrazyTim/spin-wheel)，MIT License
- [Lucide](https://github.com/lucide-icons/lucide)，ISC License

背景图片由项目使用者提供。
