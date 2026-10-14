using System;
using System.Diagnostics;
using System.IO;
using System.Text;

class UpdaterTests {
    static int Run(ProcessStartInfo psi, out string output, out string error) {
        using (var process = Process.Start(psi)) {
            var stdout = process.StandardOutput.ReadToEndAsync();
            var stderr = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit(60000)) {
                process.Kill();
                throw new Exception("Tempo excedido no processo de teste.");
            }
            output = stdout.Result;
            error = stderr.Result;
            return process.ExitCode;
        }
    }
    static int Main(string[] args) {
        try {
            string script = Path.GetFullPath(args[0]);
            foreach (string path in new[] { @"C:\MP-Pedrinhas-PDV", @"C:\MP-Pedrinhas-PDV\", @"C:\PDV cliente [loja]\", "C:\\Loja d'Aliné\\" }) {
                var psi = PdvUpdater.CreateUpdateProcess(script, path);
                string output, error;
                if (Run(psi, out output, out error) != 0 || output.Trim() != Convert.ToBase64String(Encoding.Unicode.GetBytes(path)))
                    throw new Exception("Caminho alterado: " + path + " / " + output + " / " + error);
                Console.WriteLine("PASS caminho: " + path);
            }
            // Same launch method and actual update script for the database-preservation fixture.
            if (args.Length == 3) {
                string output, error;
                int code = Run(PdvUpdater.CreateUpdateProcess(Path.GetFullPath(args[1]), args[2] + "\\"), out output, out error);
                Console.WriteLine(output);
                if (code != 0) throw new Exception(error);
            }
            return 0;
        } catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }
}
