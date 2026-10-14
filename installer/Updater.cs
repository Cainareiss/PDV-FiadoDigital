using System;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

class PdvUpdater : Form {
    TextBox location = new TextBox();
    TextBox log = new TextBox();
    Button update = new Button();
    Button browse = new Button();
    ProgressBar progress = new ProgressBar();
    Label status = new Label();
    bool busy;
    bool complete;
    string logPath;
    static Color blue = Color.FromArgb(25, 62, 124);

    [STAThread] static void Main(string[] args) {
        if (args.Length == 1 && args[0] == "--verify-package") {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("update.zip"))
            using (var zip = new ZipArchive(stream)) {
                bool index = false;
                foreach (var entry in zip.Entries) {
                    string p = entry.FullName.Replace('\\','/').ToLowerInvariant();
                    if (p.EndsWith(".db") || p.Contains(".db-") || p.EndsWith(".sqlite") || p.Contains(".sqlite-") ||
                        p.EndsWith("/.env") || p.Contains("/.env.") || p.Contains("/data/") || p.Contains("/backups/")) Environment.Exit(2);
                    if (p == "payload/app/dist/index.js") index = true;
                }
                Environment.Exit(index ? 0 : 3);
            }
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new PdvUpdater());
    }
    PdvUpdater() {
        Text = "MP Pedrinhas | Atualização 1.0.8";
        ClientSize = new Size(740, 590);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        BackColor = Color.FromArgb(245,247,251);
        Font = new Font("Segoe UI", 10);
        var header = new Panel { BackColor = blue, Dock = DockStyle.Top, Height = 112 };
        header.Controls.Add(new Label { Text = "MP PEDRINHAS", ForeColor = Color.White, Font = new Font("Segoe UI",22,FontStyle.Bold), Bounds = new Rectangle(30,20,660,42) });
        header.Controls.Add(new Label { Text = "Assistente de atualização • versão 1.0.8", ForeColor = Color.White, Bounds = new Rectangle(33,70,640,28) });
        Controls.Add(header);
        Controls.Add(new Label { Text = "Estoque completo e mensagens claras no cadastro", Font = new Font("Segoe UI",14,FontStyle.Bold), Bounds = new Rectangle(30,132,680,35) });
        Controls.Add(new Label { Text = "Este assistente faz backup automático e verifica a preservação dos dados.\nConclua as vendas em andamento e feche as telas do PDV antes de continuar.", Bounds = new Rectangle(30,178,680,54) });
        location.SetBounds(30,245,560,30); location.Text = FindInstall(); Controls.Add(location);
        browse.Text = "Procurar…"; browse.SetBounds(605,242,105,34); Controls.Add(browse);
        browse.Click += delegate { using (var d = new FolderBrowserDialog()) { d.Description = "Selecione a pasta onde está MP-Pedrinhas.exe"; if(d.ShowDialog() == DialogResult.OK) location.Text = d.SelectedPath; } };
        status.SetBounds(30,295,680,25); status.Text = "Pronto para atualizar. Seus produtos, clientes e vendas serão preservados."; Controls.Add(status);
        progress.SetBounds(30,329,680,9); Controls.Add(progress);
        log.SetBounds(30,356,680,155); log.Multiline = true; log.ReadOnly = true; log.ScrollBars = ScrollBars.Vertical; log.BackColor = Color.White; Controls.Add(log);
        update.Text = "Atualizar agora"; update.SetBounds(510,535,200,40); update.BackColor = blue; update.ForeColor = Color.White; update.FlatStyle = FlatStyle.Flat; Controls.Add(update);
        update.Click += async delegate { if (complete) { Close(); return; } await RunUpdate(); };
        FormClosing += (s,e) => { if(busy) e.Cancel = true; };
    }
    static string FindInstall() {
        foreach (var root in new[] { Registry.LocalMachine, Registry.CurrentUser })
        foreach (string path in new[] { @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" }) {
            using(var key = root.OpenSubKey(path)) {
                if(key == null) continue;
                foreach(string name in key.GetSubKeyNames()) using(var sub = key.OpenSubKey(name)) {
                    string title = Convert.ToString(sub.GetValue("DisplayName"));
                    string dir = Convert.ToString(sub.GetValue("InstallLocation"));
                    try {
                        dir = Path.GetFullPath(dir.Trim().Trim('"'));
                        if(title.Contains("MP Pedrinhas") && File.Exists(Path.Combine(dir,"MP-Pedrinhas.exe"))) return dir;
                    } catch (ArgumentException) {} catch (NotSupportedException) {}
                }
            }
        }
        return @"C:\MP-Pedrinhas-PDV";
    }
    void Append(string line) {
        if(string.IsNullOrEmpty(line)) return;
        BeginInvoke((Action)delegate { log.AppendText(line + Environment.NewLine); });
    }
    // Windows treats a backslash before a closing command-line quote specially.
    // Pass paths as PowerShell literals inside an encoded command instead.
    internal static ProcessStartInfo CreateUpdateProcess(string scriptPath, string installDir) {
        string command = "$ErrorActionPreference = 'Stop'; try { & '" + scriptPath.Replace("'", "''") +
            "' -InstallDir '" + installDir.Replace("'", "''") + "' -NoRestart; exit 0 } catch { Write-Error $_ -ErrorAction Continue; exit 1 }";
        string encoded = Convert.ToBase64String(Encoding.Unicode.GetBytes(command));
        var psi = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
            @"WindowsPowerShell\v1.0\powershell.exe"), "-NoProfile -NonInteractive -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand " + encoded);
        psi.UseShellExecute = false; psi.CreateNoWindow = true; psi.WindowStyle = ProcessWindowStyle.Hidden;
        psi.RedirectStandardOutput = psi.RedirectStandardError = true;
        return psi;
    }
    async Task RunUpdate() {
        string dir;
        try { dir = Path.GetFullPath(location.Text.Trim().Trim('"')); } catch { MessageBox.Show("Selecione uma pasta válida."); return; }
        if(!File.Exists(Path.Combine(dir,"MP-Pedrinhas.exe")) || !Directory.Exists(Path.Combine(dir,"app"))) { MessageBox.Show("Instalação não encontrada. Clique em Procurar e selecione a pasta do PDV."); return; }
        if(MessageBox.Show("Deseja atualizar o PDV em:\n" + dir + "?\n\nO servidor será encerrado e um backup será criado antes da atualização.", "Confirmar atualização", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
        busy = true; update.Enabled = browse.Enabled = location.Enabled = false;
        progress.Style = ProgressBarStyle.Marquee; status.Text = "Preparando backup e atualização…";
        try {
            string temp = Path.Combine(Path.GetTempPath(), "MP-PDV-update-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(temp);
            logPath = Path.Combine(temp,"atualizacao.log");
            int result = await Task.Run(() => {
                using(var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("update.zip"))
                using(var zip = new ZipArchive(stream)) zip.ExtractToDirectory(temp);
                var psi = CreateUpdateProcess(Path.Combine(temp,"Atualizar-PDV.ps1"), dir);
                using(var writer = new StreamWriter(logPath))
                using(var p = new Process { StartInfo = psi }) {
                    DataReceivedEventHandler output = (s,e) => { if(e.Data != null) { lock(writer) { writer.WriteLine(e.Data); writer.Flush(); } Append(e.Data); } };
                    p.OutputDataReceived += output; p.ErrorDataReceived += output;
                    p.Start(); p.BeginOutputReadLine(); p.BeginErrorReadLine(); p.WaitForExit(); return p.ExitCode;
                }
            });
            if(result != 0) throw new Exception("A atualização não foi concluída. Consulte os detalhes abaixo.\nLog: " + logPath);
            complete = true; status.Text = "Atualização concluída. Dados e configurações conferidos.";
            progress.Style = ProgressBarStyle.Blocks; progress.Value = 100; update.Text = "Concluir";
            MessageBox.Show("Atualização concluída!\n\nO backup está na pasta backups da instalação.\nAbra o PDV pelo atalho habitual e atualize as telas com Ctrl+F5.", "Tudo pronto", MessageBoxButtons.OK, MessageBoxIcon.Information);
        } catch(Exception ex) { status.Text = "Não foi possível concluir. Veja os detalhes."; log.AppendText(ex.Message); MessageBox.Show(ex.Message,"Atualização interrompida",MessageBoxButtons.OK,MessageBoxIcon.Error); }
        finally { busy = false; update.Enabled = true; browse.Enabled = location.Enabled = !complete; if(!complete) { progress.Style = ProgressBarStyle.Blocks; progress.Value = 0; } }
    }
}
