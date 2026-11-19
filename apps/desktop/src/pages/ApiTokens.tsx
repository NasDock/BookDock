import {
  getApiClient,
  type ApiKey,
  type CreatedApiKey,
} from "@bookdock/api-client";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, Input } from "@bookdock/ui";
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Plus,
  Trash2,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function formatDate(value: string | null) {
  if (!value) return "永不过期";
  return new Date(value).toLocaleDateString("zh-CN");
}

export default function ApiTokensPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 创建弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("0");
  const [creating, setCreating] = useState(false);

  // 创建成功后展示明文（仅一次）
  const [createdToken, setCreatedToken] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  // 编辑弹窗
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getApiClient().getApiKeys();
      if (res.success) setKeys(res.data || []);
      else setError(res.error || res.message || "加载失败");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const days = Number(expiresInDays) || 0;
      const res = await getApiClient().createApiKey({ name: newName.trim(), expiresInDays: days });
      if (res.success && res.data) {
        setCreatedToken(res.data);
        setNewName("");
        setExpiresInDays("0");
        setCreateOpen(false);
        void load();
      } else {
        setError(res.error || res.message || "创建失败");
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (key: ApiKey) => {
    try {
      const res = await getApiClient().updateApiKey(key.id, { isActive: !key.isActive });
      if (res.success) void load();
      else setError(res.error || res.message || "操作失败");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "操作失败");
    }
  };

  const handleSaveEdit = async () => {
    if (!editing || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await getApiClient().updateApiKey(editing.id, { name: editName.trim() });
      if (res.success) {
        setEditing(null);
        void load();
      } else {
        setError(res.error || res.message || "保存失败");
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key: ApiKey) => {
    if (!window.confirm(`确定删除「${key.name}」吗？使用此 Token 的应用将立即无法访问。`)) return;
    try {
      const res = await getApiClient().deleteApiKey(key.id);
      if (res.success) void load();
      else setError(res.error || res.message || "删除失败");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "删除失败");
    }
  };

  const copyToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("复制失败，请手动选择文本复制");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">API 令牌</h1>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        令牌可用于在 NAS、脚本或其他设备上访问书仓内容（除账号信息外）。令牌只在创建时显示一次，请妥善保存。
      </p>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              <span className="inline-flex items-center gap-1">
                <KeyRound className="w-5 h-5" /> 我的令牌
              </span>
            </CardTitle>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> 新建
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-gray-400">加载中...</div>
          ) : keys.length === 0 ? (
            <div className="py-8 text-center text-gray-400">暂无令牌，点击「新建」创建一个</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {keys.map((key) => (
                <div key={key.id} className="py-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white truncate">{key.name}</span>
                      <Badge variant={key.isActive ? "success" : "default"}>
                        {key.isActive ? "启用" : "已停用"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 space-x-3">
                      <span>创建于 {formatDate(key.createdAt)}</span>
                      <span>到期 {formatDate(key.expiresAt)}</span>
                      <span>
                        {key.lastUsedAt
                          ? `最近使用 ${new Date(key.lastUsedAt).toLocaleString("zh-CN")}`
                          : "从未使用"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditing(key); setEditName(key.name); }}
                    >
                      改名
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleToggle(key)}
                    >
                      {key.isActive ? "停用" : "启用"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => void handleDelete(key)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建弹窗 */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建 API 令牌"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
              {creating ? "创建中..." : "创建"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="名称"
            placeholder="例如：NAS 同步"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            label="有效天数（0 表示永不过期）"
            type="number"
            min={0}
            max={3650}
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
          />
        </div>
      </Dialog>

      {/* 创建成功：明文只展示一次 */}
      <Dialog
        open={!!createdToken}
        onClose={() => setCreatedToken(null)}
        title="令牌已创建"
        size="lg"
        footer={
          <Button onClick={() => setCreatedToken(null)}>我已保存</Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            请立即复制并保存，关闭后无法再次查看明文。
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-gray-100 dark:bg-gray-900 p-3 text-sm text-gray-800 dark:text-gray-200">
              {createdToken?.token}
            </code>
            <Button size="sm" variant="secondary" onClick={() => void copyToken()}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 改名弹窗 */}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="重命名令牌"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={() => void handleSaveEdit()} disabled={saving || !editName.trim()}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </>
        }
      >
        <Input
          label="名称"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
        />
      </Dialog>
    </div>
  );
}
