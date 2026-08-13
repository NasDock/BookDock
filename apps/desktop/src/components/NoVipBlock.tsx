import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@bookdock/ui';
import {
  Crown,
  Headphones,
  Layout,
  MessageCircle,
  QrCode,
  Check,
} from 'lucide-react';

interface NoVipBlockProps {
  message?: string;
}

export default function NoVipBlock({
  message = '当前功能仅对会员开放',
}: NoVipBlockProps) {
  const navigate = useNavigate();

  const benefits = [
    { icon: QrCode, text: '扫码登录' },
    { icon: Layout, text: '桌面小组件' },
    { icon: MessageCircle, text: '优先客服' },
    { icon: Headphones, text: '声仓会员' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full mb-4">
          <Crown className="w-8 h-8 text-white" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          尊享会员专享
        </h2>

        {/* Message */}
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          {message}
        </p>

        {/* Benefits */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6 text-left">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            会员特权
          </p>
          <div className="space-y-1.5">
            {benefits.map((b) => (
              <p key={b.text} className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                <b.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                {b.text}
              </p>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button
            onClick={() => navigate('/member-benefits')}
            className="w-full"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
          >
            立即开通会员
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="w-full text-gray-500"
          >
            返回书架
          </Button>
        </div>
      </div>
    </div>
  );
}
