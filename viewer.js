import {DefaultColors} from "./defaultcolors.js";
import {Utils} from "./utils.js";
import {VertexShader} from "./shader.js";
import {FragmentShader} from "./shader.js";
import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';

import { CameraControl } from './cameracontrol.js';
import { Register } from './register.js';
import { MyGUI } from './mygui.js';
import { ModelOperate } from './modeloperate.js';

/**
 * @export
 * @class Viewer
 */

 //边框颜色
const outlineColor = new BABYLON.Color3(1.0, 0.5, 0.0);
//理想FPS
const idealFPS = 45;
//理想帧渲染时间(毫秒)
const idealTime = 1000 / idealFPS;
//帧渲染开始时间
let lastFrameTime = 0;
//用于反复验证是否符合预渲染结束条件
let renderCount = 0;



export class Viewer {
 
    constructor(bim, canvas) {

        this.bim = bim;

        this.canvas=canvas;

        this.engine = new BABYLON.Engine(canvas, true, {stencil: true}, true);
   
        //颜色库
        this.defaultColors =  DefaultColors;
                    
        //是否第一次加载模型
        this.bFirst=true;

        //整体模型边界值
        this.modelBounds={
            min: new BABYLON.Vector3(Infinity, Infinity, Infinity),
            max: new BABYLON.Vector3(-Infinity, -Infinity, -Infinity)
        }

        //存储颜色已改变对象的源颜色 name  -> colorData
        this.changedMesh_Mat = new Map();

        this.data={
            count:0,
            roid:[27262977,27328513,27197441,27721729,27787265,27852801,28246017,28311553,28377089,28442625,28508161,28573697,29622273,41222145,42532865,41353217],
            poid:[46268419,46399491,46137347,47185923,47316995,47448067,47710211,47841283,47972355,48103427,48234499,48365571,49741827,74711043,76283907,74973187]
        }

        //漫游速度
        this.roamSpeed = .1;
        //在包围盒中便可以设置重力
        this.isInBound = false;
        //重力
        this.gravityFlag = false;
        //碰撞
        this.collisionFlag = false;
        //当前拾取的对象
        this.pickedMesh = null;
        //漫游模式
        this.roamModeFlag = false;       
        //动画过程中
        this.animalFlag = false;

        //分解模型(mesh位置改变)
        this.meshPosChange = false;

        this.renderLoop = true;
        this.renderState = 0;
        this.extraRender = false;

        //相机移动时，场景隐藏的最大mesh的索引
        this.index = 0;
        //index是否最终确定
        this.indexComputeEnd = false;
        //存储不同project下的主视角、包围盒、index
        this.projectData = {
            view : {
                rotations : [],
                positions : []
            },
            modelBounds : [],
            index : []
        }

        this.beforeRenderFunc = () => {
            lastFrameTime = BABYLON.PrecisionDate.Now;  //记录渲染开始时间
            let cameraViewMatrix = this.scene.activeCamera.getViewMatrix().clone();    //获取相机视图矩阵
            if(this.preCameraViewMatrix.equals(cameraViewMatrix) && !this.meshPosChange) {    //相机已停止移动
                if(this.indexComputeEnd) {
                    for(let i = this.index; i < this.scene.meshes.length; i++) {
                        this.scene.meshes[i].isVisible = true;
                    }
                }
            }
        }

        this.afterRenderFunc= () => {
            let curTime = BABYLON.PrecisionDate.Now;    //记录渲染结束时间
            let frameRenderTime = curTime - lastFrameTime;  //渲染帧时间
            let cameraViewMatrix = this.scene.activeCamera.getViewMatrix().clone();    //获取相机试图矩阵
            if(!this.preCameraViewMatrix.equals(cameraViewMatrix) || this.meshPosChange) {   //相机移动
                this.preCameraViewMatrix = cameraViewMatrix.clone();
                this.meshPosChange = false;
                if(frameRenderTime > idealTime) {
                    if(this.indexComputeEnd) {
                        for(let i=this.index; i<this.scene.meshes.length; i++) {
                            this.scene.meshes[i].isVisible = false;
                        }
                    }
                    else {
                        //重复验证，防止FPS波动出现误差
                        if(renderCount < 4) {
                            renderCount++;
                            return;
                        }
                        //从按体积比排序的尾部一次减少显示的mesh，直至达到理想FPS
                        let percentage = this.scene.meshes[this.index-1].percentage;
                        for(let i=this.index-1;i>=0;i--) {
                            if(this.scene.meshes[i].percentage == percentage) {
                                this.scene.meshes[i].isVisible = false;
                            }
                            else {
                                this.index = i;
                                console.log(this.index);
                                return;
                            }
                        }
                    }
                }
                else {
                    //index未计算结束，此时已达到理想FPS
                    if(!this.indexComputeEnd) {
                        console.log('计算结束',this.index);
                        this.projectData.index.push(this.index);
                        this.indexComputeEnd = true;
                        renderCount = 0;
                        for(let mesh of this.scene.meshes) {
                            mesh.alwaysSelectAsActiveMesh = false;
                        }
                        return;
                    }
                }
            }
        }
    }

    init() {
        let _this=this;
        let promise = new Promise((resolve, reject) => {
            
            //创建场景
            _this.scene=new BABYLON.Scene(_this.engine);
            // _this.scene.debugLayer.show();

            //添加摄像机
            _this.camera = new BABYLON.UniversalCamera("UniversalCamera", new BABYLON.Vector3(0, 1, -2), _this.scene);
            _this.camera.attachControl(_this.canvas, true);
            _this.camera.inputs.remove(_this.camera.inputs.attached.mouse);  //关闭pointers
            _this.preCameraViewMatrix = _this.scene.activeCamera.getViewMatrix().clone();

            // 添加灯光
            let light1 = new BABYLON.HemisphericLight("HemiLight", new BABYLON.Vector3(-1, 10, 0), _this.scene);
          
            //模型操控对象
            this.operator = new ModelOperate(_this);

            //添加页面控件
            let fGUI = GUI.AdvancedDynamicTexture.CreateFullscreenUI("myUI");
            _this.gui = new MyGUI(fGUI, _this);        

            //创建摄像机控制器(协助摄像机)
            _this.cameraControl = new CameraControl(_this);       

            _this.register = new Register(_this);

            if(Utils.isPC()){               //PC端
                _this.scene.onPointerDown = () => {
                    _this.lastX = event.x;
                    _this.lastY = event.y;
                };
                _this.scene.onPointerUp = (event) => {
                    if(_this.lastX == event.x && _this.lastY == event.y && !_this.animalFlag ) {
                        let pickResult = _this.scene.pick(event.x, event.y);  //获取拾取结果
                        if(_this.pickedMesh){
                            _this.disableOutline();
                            _this.pickedMesh=null;
                            _this.renderState = 1;
                        }
                        if(pickResult.hit) {
                            _this.pickedMesh=pickResult.pickedMesh;   //记录拾取到的mesh
                            _this.renderOutline();
                            if(!_this.roamModeFlag) {
                                _this.viewFit(_this.pickedMesh.getBoundingInfo(), true);
                            }
                            _this.renderState = 2;
                        }
                    }
                };
            }
            else{
                Utils.addEvent(_this.canvas,"touchstart",(event)=>{
                    _this.lastX = event.touches[0].pageX;
                    _this.lastY = event.touches[0].pageY;
                },false);
                Utils.addEvent(_this.canvas,"touchend",(event)=>{
                    console.log(event)
                    if(_this.lastX == event.changedTouches[0].pageX && _this.lastY == event.changedTouches[0].pageY && !_this.animalFlag ) {
                        let pickResult = _this.scene.pick(event.changedTouches[0].pageX, event.changedTouches[0].pageY);  //获取拾取结果
                        if(_this.pickedMesh){
                            _this.disableOutline();
                            _this.pickedMesh=null;
                            _this.renderState = 1;
                        }
                        if(pickResult.hit) {
                            _this.pickedMesh=pickResult.pickedMesh;   //记录拾取到的mesh
                            _this.renderOutline();
                            if(!_this.roamModeFlag) {
                                _this.viewFit(_this.pickedMesh.getBoundingInfo(), true);
                            }
                            _this.renderState = 2;
                        }
                    }
                },false);
            }

            _this.engine.runRenderLoop(function () {
                if (_this.scene) {
                    if(_this.renderLoop) {
                        _this.scene.render();
                    }
                    else if(_this.renderState > 0){
                        _this.scene.render();
                        _this.renderState -= 1;
                    }
                    else if(_this.extraRender) {
                        _this.scene.render();
                        _this.extraRender = false;
                    }
                }
            });

            // 尺寸自适应
            window.addEventListener("resize", function () {
                _this.engine.resize();
                _this.renderState = 1;
            });  
            resolve();
        });
        return promise;
    }

    createMesh(data) {
        let mesh = new BABYLON.Mesh("mesh",this.scene);
        let vertexData = new BABYLON.VertexData();          //设置顶点信息

        vertexData.positions = data.vertices;
        vertexData.indices = data.indices;	
        vertexData.normals = data.normals;
    
        vertexData.applyToMesh(mesh);
        mesh.id = data.id;
        mesh.name=data.name;
        mesh.rotation.x=-Math.PI/2;
        mesh.scaling.set(0.01,0.01,0.01);
        mesh.checkCollisions = true;
        mesh.alwaysSelectAsActiveMesh = true;
        if(data.colors.color.length>1){
            let startIndex = 0;
            let multiMat = new BABYLON.MultiMaterial("multi", this.scene);
            let indexCounts = Utils.getIndexCountsWithSameColor(data);
            mesh.subMeshes = [];
            for(let i=0;i<data.colors.color.length;i++){
                let color = data.colors.color[i];
                let name = 'mat'+i;
                let material = new BABYLON.StandardMaterial(name, this.scene);
                material.diffuseColor = new BABYLON.Color3(color[0], color[1], color[2]);
                material.alpha=color[3];
                multiMat.subMaterials.push(material);
                let subMesh = new BABYLON.SubMesh(i, 0, data.vertices.length/3, startIndex, indexCounts[i], mesh);
                startIndex += indexCounts[i];
            } 
            mesh.material = multiMat;
        }
        else{
            let color = data.colors.color[0];
            let singleMat = new BABYLON.StandardMaterial("single", this.scene);
            singleMat.diffuseColor = new BABYLON.Color3(color[0],color[1],color[2]);
            singleMat.alpha=color[3];
            mesh.material = singleMat;
        }
        
        if(mesh.material.alpha < 1) {
            mesh.percentage = 0.0001;
        }
        else {
            //用于计算体积对于渲染物体的影响
            let bound = mesh.getBoundingInfo();
            let percentage = bound.maximum.subtract(bound.minimum).length() /
                                this.modelBounds.max.subtract(this.modelBounds.min).length();
            mesh.percentage = percentage;
        }
        //若不是首次加载，存储添加的模型
        if(!this.bFirst) {
            this.operator.setAddedModels(mesh);
        }
    }

    renderOutline() {
        let initalData = {
            vertices : this.pickedMesh.geometry._positions,
            indices : this.pickedMesh.geometry._indices
        }
        let data = this.getOutlineData(initalData);

        let outline = BABYLON.MeshBuilder.CreateLineSystem("outline", {lines: data}, this.scene);
        outline.position = this.pickedMesh.position.clone();
        outline.rotation = this.pickedMesh.rotation.clone();
        outline.scaling = this.pickedMesh.scaling.clone();
        outline.computeWorldMatrix(); 
        outline.color = outlineColor;
        outline.renderingGroupId = 1;

        //将线条添加进拆解模型数组
        this.operator.modelsLength.set(outline.id,this.operator.modelsLength.get(this.pickedMesh.id));

        this.scene.setRenderingAutoClearDepthStencil(1, true);
    }

    disableOutline() {
        let result = this.scene.getMeshByName("outline").id;
        this.operator.modelsLength.delete(result);          //将线条移出拆解模型数组
        this.scene.removeMesh(this.scene.getMeshByName("outline"));
    }

    getOutlineData(data) {
        let result = [];
        const s = new Set();
        for (let i=0; i<data.indices.length; i+=3) {
            for (let j = 0; j < 3; ++j) {
                let a = data.indices[i + j];
                let b = data.indices[i + (j+1)%3];
                if (a > b) {
                    const tmp = a;
                    a = b;
                    b = tmp;
                }
                const abs = a * 67108864 + b; 
                if (s.has(abs)) {
                    s.delete(abs);
                } else {
                    s.add(abs);
                }
            }
        }
        for (let e of s) {
            const a = Math.floor(e / 67108864);
            const b = e - a * 67108864;
            result.push([data.vertices[a], data.vertices[b]]);
        }
        return result;
    }

    setModelBounds(modelBounds) {
        let lastDiagonal = this.modelBounds.max.subtract(this.modelBounds.min).length(); 
        this.modelBounds.max.maximizeInPlace(modelBounds.max);
        this.modelBounds.min.minimizeInPlace(modelBounds.min);
        this.projectData.modelBounds.unshift(this.modelBounds);
        let diagonal = this.modelBounds.max.subtract(this.modelBounds.min).length(); 
        if(diagonal != lastDiagonal) {
            let factor = diagonal / lastDiagonal;
            if(factor > 0) {
                for(let mesh of this.scene.meshes) {
                    mesh.percentage *= factor;
                }
            }
        }
        this.viewFit(this.modelBounds, false);
    }

    viewFit(modelBounds, isAnimal) {
        let fov = this.scene.activeCamera.fov * 0.875;  //相机视角 弧度
        let pos = this.scene.activeCamera.position.clone(); //相机位置
        let fitPos = new BABYLON.Vector3();
        if(isAnimal) {
            let target = this.scene.activeCamera.getTarget().clone();   //相机目标点
            let posToTarget = pos.subtract(target).normalize(); //相机看向方向
            let diagonal = modelBounds.diagonalLength;  //包围盒对角线长度
            let factor = Math.abs(diagonal / Math.tan(fov));    //相机与目标点的距离
            let center = modelBounds.boundingBox.centerWorld;   //包围盒中心点
            posToTarget.scaleToRef(factor,posToTarget);     
            center.addToRef(posToTarget, fitPos);   //计算相机最终位置
            this.scene.activeCamera.maxZ += factor+diagonal;
            let positions = [pos,fitPos];
            let roamGroup = this.cameraControl.roamAnimation([], positions);
            roamGroup.play();
        }
        else {
            let posToTarget = new BABYLON.Vector3(0, 1, -10).normalize(); //相机看向方向
            let diagonal = BABYLON.Vector3.Distance(modelBounds.min, modelBounds.max);  //包围盒对角线长度
            let factor = Math.abs(diagonal / Math.tan(fov));    //相机与目标点的距离
            let center = modelBounds.min.add(modelBounds.max).scale(0.5);   //包围盒中心点
            posToTarget.scaleToRef(factor,posToTarget);
            center.addToRef(posToTarget, fitPos);   //计算相机最终位置
            this.scene.activeCamera.maxZ += factor+diagonal;
            this.projectData.view.positions.unshift(fitPos);
            if(this.bFirst) {
                this.scene.activeCamera.position = fitPos;
                this.scene.activeCamera.setTarget(center);
                this.projectData.view.rotations.unshift(this.scene.activeCamera.rotation.clone());
            }
            else {
                this.projectData.view.rotations.unshift(this.getRotation(fitPos, center));
            }
            this.renderState = 1;
        }
    }

    getRotation(position, target) {
        let rotation = BABYLON.Vector3.Zero();
        let upVector = this.scene.activeCamera.upVector.normalize();

        let vDir = target.subtract(position);

        let initialFocalDistance = vDir.length();

        if (position.z === target.z) {
            position.z += 0.001;
        }

        let mat = BABYLON.Matrix.Identity();
        BABYLON.Matrix.LookAtLHToRef(position, target, upVector, mat);
        mat.invert();

        rotation.x = Math.atan(mat.m[6] / mat.m[10]);

        if (vDir.x >= 0.0) {
            rotation.y = (-Math.atan(vDir.z / vDir.x) + Math.PI / 2.0);
        } else {
            rotation.y = (-Math.atan(vDir.z / vDir.x) - Math.PI / 2.0);
        }

        rotation.z = 0;

        if (isNaN(rotation.x)) {
            rotation.x = 0;
        }

        if (isNaN(rotation.y)) {
            rotation.y = 0;
        }

        if (isNaN(rotation.z)) {
            rotation.z = 0;
        }

        return rotation;
    }

    enableSectionPlane() {
        if(!this.scene.clipPlane) {
            this.scene.clipPlane = new BABYLON.Plane(-1,0,0,0);     //X  
            this.scene.clipPlane2 = new BABYLON.Plane(1,0,0,0);     
            this.scene.clipPlane3 = new BABYLON.Plane(0,-1,0,0);    //Y   
            this.scene.clipPlane4 = new BABYLON.Plane(0,1,0,0);    
            this.scene.clipPlane5 = new BABYLON.Plane(0,0,-1,0);    //Z  
            this.scene.clipPlane6 = new BABYLON.Plane(0,0,1,0);   
            this.renderState = 1; 
        }
    }

    disableSectionPlane() {
        this.scene.clipPlane = null;            //设置为null
        this.scene.clipPlane2 = null;
        this.scene.clipPlane3 = null;
        this.scene.clipPlane4 = null;          
        this.scene.clipPlane5 = null;
        this.scene.clipPlane6 = null; 
        this.renderState = 1; 
    }

    checkInBound( camera ){          //检查是否在AABB包围盒中
        let position = camera.position.clone();
        if( position.x - this.modelBounds.max.x < 0  && position.z - this.modelBounds.max.y < 0 &&
            position.x - this.modelBounds.min.x > 0  && position.z - this.modelBounds.min.y > 0 &&
            position.y - this.modelBounds.min.z > 20) {
            return true;
        }
        return false;
    }
}

