# 后台云盘上传、下载校验与更新源部署

本流程来自 2026-10-13 的 v0.1.27 实际发布。历史回执见项目 `Resources/releases/v0.1.27/cloud-publication-report.json`；版本、摘要和备份路径仅属于该次发布，不作为新版本常量。

## 路径与执行工作区

先确认持有 NEXT 源码和已验证包的发布工作区。原目录版本落后时，不能从原目录重新构建或读取旧版日志；包可以保存在原目录，清单生成器、版本元数据和日志必须来自发布工作区。

定位 MNAddon 上级目录的 `batch_build_addons.sh`、`mnpinner/build/pan123-path-url.py` 和 `.codex/skills/mnaddon-123pan-web-upload/SKILL.md`。检查当前目录编号、下载助手映射及部署配置的有效覆盖值。不要直接 source 整个打包脚本，避免进入菜单、重新构建或额外发布；需要复用函数时仅提取已检查的函数及实际依赖，并检查脚本语法。

独立检出找不到共享脚本时，先查已配置的 MNAddon 工作区。仍不可访问时，仅暂停依赖该脚本的步骤；不得凭记忆构造新上传接口、索取开发者密钥或编造核验成功。

## 后台网页上传

先复用 MNAddon 的[网页上传技能](../../../../../../Tooling/internal/skills/codex/mnaddon-123pan-web-upload/SKILL.md)及其[后台连接、上传与恢复流程](../../../../../../Tooling/internal/skills/codex/mnaddon-123pan-web-upload/references/web-ui.md)。共享技能是浏览器连接、上传、恢复与结束操作的维护点，本文件仅保留评论管理器的发布对象与后续部署约定。

- 未明确指定浏览器时，根据本次实际连接、登录状态和后台上传能力选择可用实例，不固定 Arc 或 Chrome，不为常规工具选择提问。用户明确指定浏览器、账号或资料时保留该选择；不能擅自切换账号。
- 当前仅通过本地命令行执行。使用 `bsk browsers --json` 取得真实实例，创建显式 `--no-focus` 的专属任务会话，核对页面控制凭据并用 `bsk upload` 拦截文件选择请求；不得默认调用 CUA、系统文件选择器或系统键鼠。
- 目标为 `mncommentmanager` 的 `stable` 通道，当前默认文件夹为 `MNCommentManager`、编号 `28467434`，网页为 `https://yun.123pan.cn/`；以当前脚本有效配置为准。核对现有账号、目录名、面包屑和 `homeFilePath`，确认对应下载路径。
- 上传前检查同名包并固定本次生产包副本和 SHA-256。同名同摘要则复用；不同摘要按共享技能现行覆盖授权先完整备份核验，不静默删除或自动改名。
- 上传结果不明时先检查目录、传输状态或只读完整下载证据，不重复上传，不把空传输列表判定为失败。登录、验证码、人工接管和工具确认按实际要求处理；确需前台时才说明具体操作并取得对应授权。

## 下载校验

从持有共享助手的目录调用实际路径和本次包绝对路径，例如在 mncommentmanager 原目录中：

```bash
python3 ../mnpinner/build/pan123-path-url.py mncommentmanager stable /absolute/path/mn-comment-manager-vNEXT.mnaddon --verify
```

在隔离工作区中不能假定 `../mnpinner` 存在；使用已定位的助手绝对路径。退出码为 0 才能报告下载一致。助手检查完整 ZIP、根目录 `mnaddon.json`、大小、远端 SHA-256 与本地一致，以及校验期间本地包未变；另外读取包内版本为 NEXT，并与 GitHub 附件摘要核对。

URL 采用助手按实际文件名返回并核验通过的长链接。有效 ZIP 与本地不同且上传已确认完成时，可加 `--wait-for-cdn` 使用其有界重试；HTTP、认证及网络失败须单独处理，不能无限等待或重传。

## 生成与同步真实清单

从当前主站读取在线清单，备份原始字节并核对兼容站状态；记录已有本地清单改动。以真实在线清单为生成输入，保留其当前条目与历史。已有本地独立条目和自定义字段应检查并保留，不能用服务器副本静默丢弃。历史缺少当前条目时先补入真实已发布条目，避免生成器遗漏旧版本。

在发布工作区调用 `scripts/update-manifest.js`，传入实际包绝对路径、已验证下载 URL、输出路径及结构化日志 URL。默认输出为 `debug/123pan/mncommentmanager.json`；生成输入可先放临时文件，核验后同步输出及 `src/update-fallback/mncommentmanager.json`。运行 `node scripts/test-update-manifest.js`，检查 NEXT、stable、文件名、下载 URL、日志 URL和历史唯一性；该清单不纳入 Git 提交。

当前日志来自 `src/update-fallback/mncommentmanager_changelog.json`，其 NEXT 双语条目应唯一，历史保留。清单更新发生在包核验之后，不重新构建或替换 GitHub、云盘附件。包内 fallback 保留打包时的状态，不承诺该包内清单已经指向本包。

## 备份与部署

每次重新检查 `deploy_mncommentmanager_update_manifest`、`deploy_mncommentmanager_changelog`、`deploy_mncommentmanager_release_files` 及其有效配置。当前默认配置如下，覆盖值优先：

| 来源 | 远端目录 | 公开地址 |
| --- | --- | --- |
| 主站 | `/var/www/mnpinner-update` | `https://api.xkwxdyy.cn/update` |
| 旧版兼容站 | `/var/www/html/update` | `https://xkwxdyy.cn/update` |

默认 SSH 为 `root@101.132.47.16:22`，复用现有认证及 SSH 参数，不读取或打印密钥。当前任务是完整发版，默认部署主站和旧版兼容站；意外配置为跳过部署或关闭兼容站时先查现行决定，不能静默将未部署视为完整完成。

只处理 `mncommentmanager.json` 和 `mncommentmanager_changelog.json`。部署前将实际旧文件备份至唯一的 `backups/mncommentmanager-before-vNEXT-时间戳/`，按来源区分文件名，记录原路径、备份路径和 SHA-256；同时备份本地清单。上传候选至本次唯一暂存目录，核对摘要后在各目标目录内准备临时文件并原子替换，避免直接写入半份 JSON。沿用现有部署函数时仍需补足备份、候选摘要和替换保护。

远端文件在检查后变化时先复核，不能覆盖新的未知发布。部署失败时查询目标状态及摘要；本次失败替换需要回滚时按记录恢复对应备份并核验。只保留该次已成功的 GitHub 和云盘发布，继续恢复或部署缺失的更新源步骤。

部署后分别通过正常 HTTPS 完整读取主站和旧版兼容站的公开清单和日志，检查响应成功、NEXT、清单下载地址及字节与候选一致；不可仅检查 SSH 退出码或服务器本地文件。读取清单引用的 URL，确认其指向此前已核验的正式包。清理仅本次创建的暂存文件，保留旧文件备份和发布回执。

## 中断续作与交付

先读取已有回执及远端现状。已经验证一致的 GitHub 附件、云盘文件及公开更新源无需重复上传或部署；标签和 Release 已存在不自动触发升级版本。只有归属冲突、同名异包、未完成的工具确认或无法解决的登录及网络错误才暂停相关步骤，并报告实际完成范围。

回执记录版本、文件名、大小、SHA-256、实际后台浏览器及上传方式、目标目录、校验命令及结果、公开更新源版本和摘要、服务器备份及恢复路径。同步本地清单和项目记录，保留设备验收待办。普通技能维护不需要重新发布、部署或运行插件构建。
