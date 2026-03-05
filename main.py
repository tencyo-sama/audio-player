import subprocess
import sys
import os
import json

def run_command(command):
    print(f"実行中: {command}")
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    return result.returncode == 0

def update_video_list(video_dir, json_file):
    # videosフォルダ内のmp4ファイルを探してリスト化する
    files = [f for f in os.listdir(video_dir) if f.endswith('.mp4')]
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(files, f, ensure_ascii=False, indent=2)
    print(f"リストを更新しました: {json_file}")

def main():
    if len(sys.argv) < 2:
        print("使い方: uv run python sync_video.py [URL]")
        return

    url = sys.argv[1]
    video_dir = "videos"
    json_file = "video_list.json" # リストファイル
    
    # 1. フォルダ準備
    os.makedirs(video_dir, exist_ok=True)

    # 2. 動画のダウンロード
    print("--- ダウンロード開始 ---")
    # GitHubのファイルサイズ制限(100MB)を回避するため、95MB以下に制限し解像度も720を上限とする
    dl_cmd = f'uv run yt-dlp --max-filesize 95m -f "bestvideo[height<=720][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=720][ext=mp4][vcodec^=avc1]/best" --merge-output-format mp4 -o "{video_dir}/%(title)s.%(ext)s" {url}'
    # dl_cmd = f'uv run yt-dlp --max-filesize 95m -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" --merge-output-format mp4 -o "{video_dir}/%(title)s.%(ext)s" {url}'
    if not run_command(dl_cmd):
        print("ダウンロードに失敗しました。(容量が大きすぎるか、動画が存在しません)")
        return

    # 3. ファイルサイズの最終確認 (100MB以上のファイルが万が一生成されたら削除)
    max_size_bytes = 95 * 1024 * 1024
    for filename in os.listdir(video_dir):
        if filename.endswith(".mp4"):
            filepath = os.path.join(video_dir, filename)
            if os.path.getsize(filepath) > max_size_bytes:
                print(f"警告: {filename} は95MBを超過しているため削除しました。")
                os.remove(filepath)

    # 4. リストを自動更新
    update_video_list(video_dir, json_file)

    # 5. GitHubへ同期
    print("--- GitHubへ同期中 ---")
    run_command(f"git add {video_dir}/ {json_file}")
    run_command('git commit -m "Update video and list"')
    run_command("git push")

    print("\n完了！スマホでアクセスして確認してください。")

if __name__ == "__main__":
    main()