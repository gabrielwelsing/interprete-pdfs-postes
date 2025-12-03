'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Plus, Minus, DollarSign, Ruler, Zap, Save, Trash2, HelpCircle, Image, Scissors, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Poste {
  id: string;
  tipo: 'projetado' | 'modificado' | 'padrao-rural';
  numero: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Projeto {
  id: string;
  nome: string;
  arquivoUrl: string | null;
  arquivoTipo: 'pdf' | 'image';
  postes: Poste[];
  metragem: number;
  dataCriacao: string;
}

const PRECO_PROJETADO = 0.35;
const PRECO_MODIFICADO = 0.20;
const PRECO_PADRAO_RURAL = 1.4;

// Dimensões padrão do retângulo (reduzidas em 50%)
const RETANGULO_PADRAO_WIDTH = 40;
const RETANGULO_PADRAO_HEIGHT = 60;

export default function Home() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetoAtual, setProjetoAtual] = useState<Projeto | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arquivoPreview, setArquivoPreview] = useState<string | null>(null);
  const [arquivoTipo, setArquivoTipo] = useState<'pdf' | 'image'>('pdf');
  const [nomeProjeto, setNomeProjeto] = useState('');
  const [metragem, setMetragem] = useState<number>(0);
  const [mostrarAjuda, setMostrarAjuda] = useState(true);
  const [etapaAtual, setEtapaAtual] = useState<'upload' | 'contagem' | 'classificacao' | 'metragem' | 'resumo'>('upload');
  
  // Estados para ferramenta de recorte
  const [modoRecorte, setModoRecorte] = useState(false);
  const [tipoPosteRecorte, setTipoPosteRecorte] = useState<'projetado' | 'modificado'>('projetado');
  const [desenhando, setDesenhando] = useState(false);
  const [pontoInicial, setPontoInicial] = useState<{ x: number; y: number } | null>(null);
  const [recorteAtual, setRecorteAtual] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [imagemCarregada, setImagemCarregada] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Carregar projetos do Local Storage
  useEffect(() => {
    const projetosSalvos = localStorage.getItem('laysi-projetos');
    if (projetosSalvos) {
      setProjetos(JSON.parse(projetosSalvos));
    }
  }, []);

  // Salvar projetos no Local Storage
  useEffect(() => {
    if (projetos.length > 0) {
      localStorage.setItem('laysi-projetos', JSON.stringify(projetos));
    }
  }, [projetos]);

  // Redesenhar postes quando o projeto atual mudar
  useEffect(() => {
    if (imagemCarregada && projetoAtual) {
      redesenharPostes();
    }
  }, [projetoAtual?.postes, imagemCarregada]);

  const handleArquivoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isPdf = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');
      
      if (isPdf || isImage) {
        setArquivo(file);
        const url = URL.createObjectURL(file);
        setArquivoPreview(url);
        setArquivoTipo(isPdf ? 'pdf' : 'image');
        setImagemCarregada(false);
      } else {
        alert('Por favor, selecione um arquivo PDF ou imagem (JPG, PNG, etc.)');
      }
    }
  };

  const iniciarNovoProjeto = () => {
    if (!nomeProjeto.trim()) {
      alert('Por favor, insira um nome para o projeto');
      return;
    }

    const novoProjeto: Projeto = {
      id: Date.now().toString(),
      nome: nomeProjeto,
      arquivoUrl: arquivoPreview,
      arquivoTipo,
      postes: [],
      metragem: 0,
      dataCriacao: new Date().toISOString(),
    };

    setProjetoAtual(novoProjeto);
    setEtapaAtual('contagem');
  };

  // Funções da ferramenta de recorte
  const iniciarRecorte = (tipo: 'projetado' | 'modificado') => {
    setModoRecorte(true);
    setTipoPosteRecorte(tipo);
  };

  const cancelarRecorte = () => {
    setModoRecorte(false);
    setDesenhando(false);
    setPontoInicial(null);
    setRecorteAtual(null);
    redesenharPostes();
  };

  const limparCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const desenharRecorte = (x: number, y: number, width: number, height: number, cor: string) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Desenhar retângulo
        ctx.strokeStyle = cor;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);
        
        // Desenhar padrão rachurado ao meio (linha vertical no centro)
        ctx.save();
        ctx.strokeStyle = cor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        const centerX = x + width / 2;
        ctx.beginPath();
        ctx.moveTo(centerX, y);
        ctx.moveTo(centerX, y + height);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const redesenharPostes = () => {
    limparCanvas();
    if (projetoAtual) {
      projetoAtual.postes.forEach(poste => {
        let cor = '#10b981'; // verde para projetado
        if (poste.tipo === 'modificado') cor = '#f59e0b'; // laranja para modificado
        if (poste.tipo === 'padrao-rural') cor = '#3b82f6'; // azul para padrão rural
        desenharRecorte(poste.x, poste.y, poste.width, poste.height, cor);
      });
    }
  };

  const ajustarCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (canvas && img && img.complete && img.naturalHeight !== 0) {
      // Ajustar canvas para o tamanho da imagem renderizada
      canvas.width = img.offsetWidth;
      canvas.height = img.offsetHeight;
      canvas.style.width = `${img.offsetWidth}px`;
      canvas.style.height = `${img.offsetHeight}px`;
      setImagemCarregada(true);
      redesenharPostes();
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!projetoAtual) return;
    
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - RETANGULO_PADRAO_WIDTH / 2;
      const y = e.clientY - rect.top - RETANGULO_PADRAO_HEIGHT / 2;
      
      // Botão esquerdo = projetado, botão direito = modificado
      const tipo = e.button === 0 ? 'projetado' : 'modificado';
      
      const novoPoste: Poste = {
        id: Date.now().toString(),
        tipo,
        numero: projetoAtual.postes.length + 1,
        x,
        y,
        width: RETANGULO_PADRAO_WIDTH,
        height: RETANGULO_PADRAO_HEIGHT,
      };

      setProjetoAtual({
        ...projetoAtual,
        postes: [...projetoAtual.postes, novoPoste],
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Prevenir comportamento padrão do botão direito
    if (e.button === 2) {
      e.preventDefault();
    }
  };

  const adicionarPoste = (tipo: 'projetado' | 'modificado') => {
    if (!projetoAtual) return;

    const novoPoste: Poste = {
      id: Date.now().toString(),
      tipo,
      numero: projetoAtual.postes.length + 1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };

    setProjetoAtual({
      ...projetoAtual,
      postes: [...projetoAtual.postes, novoPoste],
    });
  };

  const removerPoste = (id: string) => {
    if (!projetoAtual) return;

    const postesAtualizados = projetoAtual.postes
      .filter(p => p.id !== id)
      .map((p, index) => ({ ...p, numero: index + 1 }));

    setProjetoAtual({
      ...projetoAtual,
      postes: postesAtualizados,
    });
  };

  const alterarTipoPoste = (id: string) => {
    if (!projetoAtual) return;

    const postesAtualizados = projetoAtual.postes.map(p => {
      if (p.id === id) {
        // Ciclo: projetado -> modificado -> padrao-rural -> projetado
        if (p.tipo === 'projetado') return { ...p, tipo: 'modificado' as const };
        if (p.tipo === 'modificado') return { ...p, tipo: 'padrao-rural' as const };
        return { ...p, tipo: 'projetado' as const };
      }
      return p;
    });

    setProjetoAtual({
      ...projetoAtual,
      postes: postesAtualizados,
    });
  };

  const finalizarContagem = () => {
    if (!projetoAtual) return;

    const projetoFinalizado = {
      ...projetoAtual,
      metragem: 0,
    };

    setProjetoAtual(projetoFinalizado);
    setProjetos([...projetos, projetoFinalizado]);
    setEtapaAtual('resumo');
    setModoRecorte(false);
  };

  const finalizarMetragem = () => {
    if (!projetoAtual) return;

    const projetoFinalizado = {
      ...projetoAtual,
      metragem,
    };

    setProjetoAtual(projetoFinalizado);
    setProjetos([...projetos, projetoFinalizado]);
    setEtapaAtual('resumo');
  };

  const calcularCustos = () => {
    if (!projetoAtual) return { projetados: 0, modificados: 0, padraoRural: 0, total: 0 };

    const projetados = projetoAtual.postes.filter(p => p.tipo === 'projetado').length;
    const modificados = projetoAtual.postes.filter(p => p.tipo === 'modificado').length;
    const padraoRural = projetoAtual.postes.filter(p => p.tipo === 'padrao-rural').length;

    const custoProjetados = projetados * PRECO_PROJETADO;
    const custoModificados = modificados * PRECO_MODIFICADO;
    const custoPadraoRural = padraoRural * PRECO_PADRAO_RURAL;
    const total = custoProjetados + custoModificados + custoPadraoRural;

    return {
      projetados: custoProjetados,
      modificados: custoModificados,
      padraoRural: custoPadraoRural,
      total,
    };
  };

  const salvarImagemComMarcacoes = () => {
    if (!projetoAtual || !imageRef.current || !canvasRef.current) return;

    // Criar um canvas temporário para combinar imagem + marcações
    const tempCanvas = document.createElement('canvas');
    const img = imageRef.current;
    
    // Garantir que a imagem está completamente carregada
    if (!img.complete || img.naturalWidth === 0) {
      alert('Aguarde a imagem carregar completamente antes de salvar.');
      return;
    }
    
    tempCanvas.width = img.naturalWidth;
    tempCanvas.height = img.naturalHeight;
    
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    // Desenhar a imagem original
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

    // Calcular escala entre imagem renderizada e imagem original
    const scaleX = img.naturalWidth / img.offsetWidth;
    const scaleY = img.naturalHeight / img.offsetHeight;

    // Desenhar todos os postes com as marcações
    projetoAtual.postes.forEach(poste => {
      let cor = '#10b981'; // verde para projetado
      if (poste.tipo === 'modificado') cor = '#f59e0b'; // laranja para modificado
      if (poste.tipo === 'padrao-rural') cor = '#3b82f6'; // azul para padrão rural
      
      // Ajustar coordenadas para o tamanho original da imagem
      const x = poste.x * scaleX;
      const y = poste.y * scaleY;
      const width = poste.width * scaleX;
      const height = poste.height * scaleY;

      // Desenhar retângulo
      ctx.strokeStyle = cor;
      ctx.lineWidth = 5;
      ctx.strokeRect(x, y, width, height);
      
      // Desenhar padrão rachurado ao meio
      ctx.save();
      ctx.strokeStyle = cor;
      ctx.lineWidth = 3;
      ctx.setLineDash([15, 8]);
      const centerX = x + width / 2;
      ctx.beginPath();
      ctx.moveTo(centerX, y);
      ctx.lineTo(centerX, y + height);
      ctx.stroke();
      ctx.restore();
    });

    // Converter canvas para blob e fazer download
    tempCanvas.toBlob((blob) => {
      if (!blob) {
        alert('Erro ao gerar a imagem. Tente novamente.');
        return;
      }

      const custos = calcularCustos();
      const nomeArquivo = `${projetoAtual.nome}_${custos.total.toFixed(2)}US.png`;
      
      // Criar link de download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeArquivo;
      
      // Simular clique para download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Liberar URL
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const resetarProjeto = () => {
    setProjetoAtual(null);
    setArquivo(null);
    setArquivoPreview(null);
    setArquivoTipo('pdf');
    setNomeProjeto('');
    setMetragem(0);
    setEtapaAtual('upload');
    setMostrarAjuda(true);
    setModoRecorte(false);
    setImagemCarregada(false);
    limparCanvas();
  };

  const deletarProjeto = (id: string) => {
    setProjetos(projetos.filter(p => p.id !== id));
  };

  const custos = calcularCustos();
  const totalPostes = projetoAtual?.postes.length || 0;
  const postesProjetados = projetoAtual?.postes.filter(p => p.tipo === 'projetado').length || 0;
  const postesModificados = projetoAtual?.postes.filter(p => p.tipo === 'modificado').length || 0;
  const postesPadraoRural = projetoAtual?.postes.filter(p => p.tipo === 'padrao-rural').length || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Pro Engenharia - Levantamento de Campo
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
            Sistema inteligente para análise de PDFs e imagens desenhados à mão, contagem de postes.
          </p>
        </div>

        {/* Sistema de Ajuda Interativa */}
        {mostrarAjuda && etapaAtual !== 'resumo' && (
          <Alert className="mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <HelpCircle className="h-5 w-5 text-blue-600" />
            <AlertDescription className="text-sm text-gray-700 dark:text-gray-300">
              {etapaAtual === 'upload' && (
                <div>
                  <strong>Passo 1:</strong> Faça upload do PDF ou imagem (JPG, PNG) desenhado à mão e dê um nome ao projeto.
                </div>
              )}
              {etapaAtual === 'contagem' && (
                <div>
                  <strong>Passo 2:</strong> Clique com o botão esquerdo para adicionar poste projetado ou botão direito para poste modificado. O retângulo aparece automaticamente padronizado.
                </div>
              )}
              {etapaAtual === 'metragem' && (
                <div>
                  <strong>Passo 3:</strong> Informe a metragem total do projeto para finalizar a análise.
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Painel Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Upload e Visualização */}
            {etapaAtual === 'upload' && (
              <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-blue-600" />
                    Upload do Arquivo
                  </CardTitle>
                  <CardDescription>
                    Faça upload do PDF ou imagem (JPG, PNG) desenhado à mão para iniciar a análise
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="nome-projeto">Nome do Projeto</Label>
                    <Input
                      id="nome-projeto"
                      placeholder="Ex: Projeto Rua Principal"
                      value={nomeProjeto}
                      onChange={(e) => setNomeProjeto(e.target.value)}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="arquivo-upload">Arquivo PDF ou Imagem</Label>
                    <div className="mt-2 flex items-center justify-center w-full">
                      <label
                        htmlFor="arquivo-upload"
                        className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl cursor-pointer bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all duration-300"
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <div className="flex gap-2 mb-3">
                            <FileText className="w-12 h-12 text-gray-400" />
                            <Image className="w-12 h-12 text-gray-400" />
                          </div>
                          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                            <span className="font-semibold">Clique para fazer upload</span> ou arraste o arquivo
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">PDF ou Imagem (JPG, PNG, etc.) - MAX. 10MB</p>
                        </div>
                        <input
                          id="arquivo-upload"
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={handleArquivoUpload}
                        />
                      </label>
                    </div>
                  </div>

                  {arquivoPreview && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                        {arquivoTipo === 'pdf' ? (
                          <FileText className="w-4 h-4" />
                        ) : (
                          <Image className="w-4 h-4" />
                        )}
                        <span>Arquivo carregado: {arquivo?.name}</span>
                      </div>
                      <Button onClick={iniciarNovoProjeto} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                        Iniciar Análise
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Contagem de Postes com Ferramenta de Recorte */}
            {etapaAtual === 'contagem' && projetoAtual && (
              <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scissors className="w-5 h-5 text-blue-600" />
                    Identificação de Postes
                  </CardTitle>
                  <CardDescription>
                    Clique com botão esquerdo (projetado) ou direito (modificado) na imagem
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Visualização do Arquivo com Canvas de Recorte */}
                  {arquivoPreview && (
                    <div ref={containerRef} className="relative border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-100 dark:bg-slate-800">
                      {arquivoTipo === 'image' ? (
                        <div className="relative w-full">
                          <img
                            ref={imageRef}
                            src={arquivoPreview}
                            alt="Imagem do projeto"
                            className="w-full h-auto max-h-[600px] object-contain block"
                            onLoad={ajustarCanvas}
                          />
                          <canvas
                            ref={canvasRef}
                            className="absolute top-0 left-0 cursor-crosshair"
                            onClick={handleCanvasClick}
                            onMouseDown={handleMouseDown}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              handleCanvasClick(e as any);
                            }}
                            style={{ 
                              touchAction: 'none'
                            }}
                          />
                        </div>
                      ) : (
                        <iframe
                          src={arquivoPreview}
                          className="w-full h-96"
                          title="PDF Preview"
                        />
                      )}
                    </div>
                  )}

                  {/* Botões de Adicionar Postes Manualmente (para PDFs) */}
                  {arquivoTipo === 'pdf' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Button
                        onClick={() => adicionarPoste('projetado')}
                        className="h-20 bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-lg"
                      >
                        <Plus className="w-5 h-5 mr-2" />
                        Adicionar Poste Projetado
                        <Badge className="ml-2 bg-white/20">{PRECO_PROJETADO.toFixed(2)} US</Badge>
                      </Button>
                      <Button
                        onClick={() => adicionarPoste('modificado')}
                        className="h-20 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg"
                      >
                        <Plus className="w-5 h-5 mr-2" />
                        Adicionar Poste Modificado
                        <Badge className="ml-2 bg-white/20">{PRECO_MODIFICADO.toFixed(2)} US</Badge>
                      </Button>
                    </div>
                  )}

                  {/* Lista de Postes */}
                  {projetoAtual.postes.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-lg">Postes Identificados ({totalPostes})</h3>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {projetoAtual.postes.map((poste) => {
                          let bgColor = 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20';
                          let badgeColor = 'border-emerald-500 text-emerald-700 dark:text-emerald-400';
                          let label = 'Projetado';
                          let preco = PRECO_PROJETADO;
                          
                          if (poste.tipo === 'modificado') {
                            bgColor = 'border-amber-200 bg-amber-50 dark:bg-amber-950/20';
                            badgeColor = 'border-amber-500 text-amber-700 dark:text-amber-400';
                            label = 'Existente';
                            preco = PRECO_MODIFICADO;
                          } else if (poste.tipo === 'padrao-rural') {
                            bgColor = 'border-blue-200 bg-blue-50 dark:bg-blue-950/20';
                            badgeColor = 'border-blue-500 text-blue-700 dark:text-blue-400';
                            label = 'Padrão Rural';
                            preco = PRECO_PADRAO_RURAL;
                          }
                          
                          return (
                            <div
                              key={poste.id}
                              className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${bgColor}`}
                            >
                              <div className="flex items-center gap-3">
                                <Badge
                                  variant="outline"
                                  className={badgeColor}
                                >
                                  #{poste.numero}
                                </Badge>
                                <span className="font-medium">{label}</span>
                                <span className="text-sm text-gray-500">
                                  {preco.toFixed(2)} US
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => alterarTipoPoste(poste.id)}
                                  className="h-8"
                                >
                                  Alterar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => removerPoste(poste.id)}
                                  className="h-8"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {projetoAtual.postes.length > 0 && (
                    <Button
                      onClick={finalizarContagem}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    >
                      Total
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Input de Metragem */}
            {etapaAtual === 'metragem' && projetoAtual && (
              <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-blue-600" />
                    Metragem do Projeto
                  </CardTitle>
                  <CardDescription>
                    Informe a metragem total identificada no arquivo
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="metragem">Metragem Total (metros)</Label>
                    <Input
                      id="metragem"
                      type="number"
                      placeholder="Ex: 150"
                      value={metragem || ''}
                      onChange={(e) => setMetragem(Number(e.target.value))}
                      className="mt-2 text-lg"
                      min="0"
                      step="0.1"
                    />
                  </div>

                  <Button
                    onClick={finalizarMetragem}
                    disabled={metragem <= 0}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Finalizar Análise
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Resumo Final */}
            {etapaAtual === 'resumo' && projetoAtual && (
              <Card className="shadow-xl border-0 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <DollarSign className="w-6 h-6 text-green-600" />
                    Análise Concluída!
                  </CardTitle>
                  <CardDescription>
                    Projeto salvo com sucesso
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
                      <div className="text-sm text-gray-500 mb-1">Total de Postes</div>
                      <div className="text-3xl font-bold text-blue-600">{totalPostes}</div>
                    </div>
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl shadow">
                      <div className="text-sm text-emerald-600 mb-1">Postes Projetados</div>
                      <div className="text-3xl font-bold text-emerald-700">{postesProjetados}</div>
                      <div className="text-sm text-gray-500 mt-1">{custos.projetados.toFixed(2)} US</div>
                    </div>
                    <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl shadow">
                      <div className="text-sm text-amber-600 mb-1">Postes Existentes</div>
                      <div className="text-3xl font-bold text-amber-700">{postesModificados}</div>
                      <div className="text-sm text-gray-500 mt-1">{custos.modificados.toFixed(2)} US</div>
                    </div>
                    {postesPadraoRural > 0 && (
                      <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-xl shadow">
                        <div className="text-sm text-blue-600 mb-1">Padrão Rural</div>
                        <div className="text-3xl font-bold text-blue-700">{postesPadraoRural}</div>
                        <div className="text-sm text-gray-500 mt-1">{custos.padraoRural.toFixed(2)} US</div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="p-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl text-white shadow-xl">
                    <div className="text-sm opacity-90 mb-2">Custo Total Estimado</div>
                    <div className="text-5xl font-bold">{custos.total.toFixed(2)} US</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button
                      onClick={resetarProjeto}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    >
                      Novo Projeto
                    </Button>
                    {arquivoTipo === 'image' && (
                      <Button
                        onClick={salvarImagemComMarcacoes}
                        className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Salvar Imagem
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Painel Lateral - Resumo em Tempo Real */}
          <div className="space-y-6">
            {/* Card de Resumo */}
            {projetoAtual && etapaAtual !== 'upload' && (
              <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-6">
                <CardHeader>
                  <CardTitle className="text-lg">Resumo do Projeto</CardTitle>
                  <CardDescription className="font-semibold text-blue-600">
                    {projetoAtual.nome}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total de Postes</span>
                      <Badge variant="outline" className="text-lg px-3">{totalPostes}</Badge>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-emerald-600">Projetados</span>
                      <span className="font-semibold">{postesProjetados}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-amber-600">Existentes</span>
                      <span className="font-semibold">{postesModificados}</span>
                    </div>
                    {postesPadraoRural > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-blue-600">Padrão Rural</span>
                        <span className="font-semibold">{postesPadraoRural}</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">Custos Estimados</div>
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-600">Projetados:</span>
                      <span className="font-semibold">{custos.projetados.toFixed(2)} US</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600">Existentes:</span>
                      <span className="font-semibold">{custos.modificados.toFixed(2)} US</span>
                    </div>
                    {postesPadraoRural > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-600">Padrão Rural:</span>
                        <span className="font-semibold">{custos.padraoRural.toFixed(2)} US</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between items-center pt-2">
                      <span className="font-bold text-gray-900 dark:text-gray-100">Total:</span>
                      <span className="text-2xl font-bold text-green-600">{custos.total.toFixed(2)} US</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Card de Legenda */}
            <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg">Legenda de Preços</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg">
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Poste Projetado</span>
                  <Badge className="bg-emerald-600">{PRECO_PROJETADO.toFixed(2)} US</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Poste Existente</span>
                  <Badge className="bg-amber-600">{PRECO_MODIFICADO.toFixed(2)} US</Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Padrão Rural</span>
                  <Badge className="bg-blue-600">{PRECO_PADRAO_RURAL.toFixed(2)} US</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Projetos Salvos */}
            {projetos.length > 0 && (
              <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Projetos Salvos</CardTitle>
                  <CardDescription>{projetos.length} projeto(s)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                  {projetos.map((projeto) => {
                    const projetadosCount = projeto.postes.filter(p => p.tipo === 'projetado').length;
                    const modificadosCount = projeto.postes.filter(p => p.tipo === 'modificado').length;
                    const padraoRuralCount = projeto.postes.filter(p => p.tipo === 'padrao-rural').length;
                    const custoTotal = (projetadosCount * PRECO_PROJETADO) + (modificadosCount * PRECO_MODIFICADO) + (padraoRuralCount * PRECO_PADRAO_RURAL);

                    return (
                      <div
                        key={projeto.id}
                        className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-semibold text-sm">{projeto.nome}</div>
                            <div className="text-xs text-gray-500">
                              {new Date(projeto.dataCriacao).toLocaleDateString()}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deletarProjeto(projeto.id)}
                            className="h-7 w-7 p-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <Badge variant="outline" className="text-emerald-600">{projetadosCount}P</Badge>
                          <Badge variant="outline" className="text-amber-600">{modificadosCount}M</Badge>
                          {padraoRuralCount > 0 && (
                            <Badge variant="outline" className="text-blue-600">{padraoRuralCount}PR</Badge>
                          )}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-green-600">
                          {custoTotal.toFixed(2)} US
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}